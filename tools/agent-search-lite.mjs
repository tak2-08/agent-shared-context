#!/usr/bin/env node
// Path: tools/agent-search-lite.mjs
// Hierarchical search + level assignment for agent-context.
// Router = rule-based heuristic (0 LLM calls, 0 install). Optional local-embedding
// adapter is opt-in via config `search.semantic.enabled` and degrades honestly.
// Cache-hierarchy metaphor: post-it(L1) → memo(HBM) → diary(DRAM) → bookshelf(SSD) → library(cold)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Issue #14 fix: require an initialized project in cwd; never silently fall back
// to the source repo.
function resolveProjectRoot() {
  const cwd = process.cwd();
  const ctxRoot = 'agent-context';
  if (existsSync(join(cwd, 'agent-context.config.json')) || existsSync(join(cwd, ctxRoot)))
    return join(cwd, ctxRoot);
  process.stderr.write("agent-context가 초기화되지 않았습니다. 먼저 'agent-context-init.mjs --yes' 를 실행하세요.\n");
  process.stderr.write("(agent-context not initialized in cwd; run 'agent-context-init.mjs --yes' first.)\n");
  process.stderr.write("cwd: " + cwd + "\n");
  process.exit(1);
}
const ROOT = resolveProjectRoot();
function resolveConfig() {
  const p = join(process.cwd(), 'agent-context.config.json');
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  return { contextRoot: 'agent-context' };
}
const CONFIG = resolveConfig();
const INDEX_PATH = join(ROOT, 'index.json');

const MIN_HIT_WEIGHT = CONFIG.search?.minHitWeight ?? 2;

const LEVELS = CONFIG.hierarchy?.levels || {
  'post-it': { tokens: 15 }, memo: { tokens: 50 }, diary: { tokens: 200 },
  bookshelf: { tokens: 1000 }, library: { tokens: 5000 },
};
const ORDER = CONFIG.hierarchy?.searchOrder || ['post-it','memo','diary','bookshelf','library'];
const RANK = Object.fromEntries(ORDER.map((k,i)=>[k,i]));
const rankOf = l => RANK[l] ?? 2;
export { search };
const __isMain = import.meta.url === pathToFileURL(process.argv[1]).href;

// ── 동의어 확장 (config search.synonyms) — 0 LLM ─────────────────────────────
const SYNONYMS = CONFIG.search?.synonyms || {};
function expandTokens(tokens) {
  const set = new Set(tokens);
  for (const t of tokens) { const s = SYNONYMS[t]; if (Array.isArray(s)) s.forEach(x=>set.add(x)); }
  for (const [k, list] of Object.entries(SYNONYMS)) if (tokens.some(t => list.includes(t))) set.add(k);
  return [...set];
}

// ── 선택적 의미 어댑터 — 기본 OFF. 실패 시 정직 폴백 (zero-install 유지) ────
async function semanticScoresIfEnabled(query, entries) {
  const cfg = CONFIG.search?.semantic;
  if (!cfg?.enabled) return null;
  try {
    const mod = await import(cfg.module || '@xenova/transformers');
    const extractor = await mod.pipeline('feature-extraction', cfg.model || 'Xenova/all-MiniLM-L6-v2');
    const embed = async t => { const o = await extractor(t, { pooling:'mean', normalize:true }); return Array.from(o.data); };
    const cos = (a,b)=>{ let d=0,na=0,nb=0; for(let i=0;i<a.length;i++){d+=a[i]*b[i];na+=a[i]**2;nb+=b[i]**2;} return d/(Math.sqrt(na)*Math.sqrt(nb)+1e-9); };
    const qv = await embed(query);
    return await Promise.all(entries.map(async e => ({ id:e.id, sim: cos(qv, await embed((e.title||'')+' '+(e.summary||''))) })));
  } catch (err) { return { unavailable: String(err.message||err).slice(0,140) }; }
}

function heuristicLevel(query) {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(Boolean).length;
  if (q.includes('overall') || q.includes('architecture') || q.includes('아키텍처') || q.includes('흐름')) return 'bookshelf';
  if (words <= 1) return 'post-it';
  if (words <= 3) return 'memo';
  if (words <= 8) return 'diary';
  return 'bookshelf';
}

function estimateLevel(e) {
  if (e.level && RANK[e.level] !== undefined) return e.level;
  const len = e.chars || ((e.summary||'').length + (e.title||'').length);
  if (len <= 80) return 'post-it';
  if (len <= 250) return 'memo';
  if (len <= 800) return 'diary';
  if (len <= 3000) return 'bookshelf';
  return 'library';
}

// collect: 주어진 시작 랭크로 스코어링·정렬 (miss-expansion의 빌딩블록)
function collect(entries, qTokens, opts, startRank, query) {
  const limit = opts.limit || 5;
  const scored = entries.map(e => {
    const lev = estimateLevel(e);
    const levRank = rankOf(lev);
    const levelDistance = Math.abs(levRank - startRank);
    // [#1] 필드 가중치 (BM25-lite): 제목3 태그2 피처2 요약1 미리보기1
    const fT=(e.title||'').toLowerCase(), fG=(e.tags||[]).join(' ').toLowerCase(),
          fF=(e.feature||'').toLowerCase(), fS=(e.summary||'').toLowerCase(),
          fP=(e.preview||'').toLowerCase();
    let w=0;
    for (const tok of qTokens) {
      if (fT.includes(tok)) w+=3;
      if (fG.includes(tok)) w+=2;
      if (fF.includes(tok)) w+=2;
      if (fS.includes(tok)) w+=1;
      if (fP.includes(tok)) w+=1;
    }
    const maxW = qTokens.length*9;
    let hitScore = maxW ? Math.min(1, w/maxW) : 0;
    const priorityScore = (e.priority||3)/5;
    let recency = 0.5;
    try { const d=(Date.now()-new Date(e.updated).getTime())/86400000; recency = d<7?1:(d<30?0.8:0.5); } catch {}
    const score = hitScore*0.5 - levelDistance*0.1 + priorityScore*0.2 + recency*0.1;
    const estTokens = LEVELS[lev]?.tokens || 200;
    return { entry:e, lev, levelDistance, hitScore, score, estTokens, w };
  }).filter(s => s.w >= (opts.minWeight ?? MIN_HIT_WEIGHT) || s.entry.feature === query?.toLowerCase() || opts.level);
  scored.sort((a,b)=>b.score-a.score);
  const top = scored.slice(0, limit);
  const topTokens = top.reduce((s,x)=>s+x.estTokens,0);
  const fullTokens = entries.reduce((s,e)=>s+(LEVELS[estimateLevel(e)]?.tokens||200),0);
  return { top, topTokens, fullTokens, hit: top.length>0, evaluated: scored.length };
}

async function search(query, opts={}) {
  let index; try { index = JSON.parse(readFileSync(INDEX_PATH,'utf8')); } catch { index = { entries: [] }; }
  const entries = index.entries || [];
  opts.minWeight = opts.minWeight ?? CONFIG.search?.minHitWeight ?? 2;
  const assignedLevel = opts.level || heuristicLevel(query);
  const rawTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const qTokens = expandTokens(rawTokens);

  // cache-miss expansion: 시작 레벨에서 miss면 큰 레벨로 최대 2회 확장
  let res = collect(entries, qTokens, opts, rankOf(assignedLevel), query);
  res.assignedLevel = assignedLevel;
  if (!res.hit && !opts.level) {
    let r = ORDER.indexOf(assignedLevel);
    for (let step=0; step<2 && r+1 < ORDER.length; step++) {
      r++;
      const retry = collect(entries, qTokens, opts, rankOf(ORDER[r]));
      if (retry.hit) { res = retry; res.expandedTo = ORDER[r]; res.assignedLevel = assignedLevel; break; }
    }
  }

  // [#1] semantic opt-in 블렌딩 — 활성화·모델 사용 가능 시에만 작동
  const sem = await semanticScoresIfEnabled(query, entries);
  if (sem && !sem.unavailable && res.top.length) {
    const simById = new Map(sem.map(x=>[x.id,x.sim]));
    // re-rank top by similarity blend
    res.top.sort((a,b)=>{
      const sa = simById.get(a.id)||0, sb = simById.get(b.id)||0;
      return sb - sa;
    });
  }

  const svNum = res.fullTokens ? (res.fullTokens-res.topTokens)/res.fullTokens*100 : 0;
  const saving = !res.hit ? 'n/a (miss)' : (svNum >= 99.95 ? '99.9%+' : svNum.toFixed(1)+'%');
  return {
    query,
    assignedLevel,
    expandedTo: res.expandedTo || null,
    router: { type:'rule-based heuristic', noLLM:true, zeroTokens:true,
              semantic: CONFIG.search?.semantic?.enabled ? (sem ? (sem.unavailable ? `unavailable: ${sem.unavailable}` : 'local-embeddings') : 'enabled-but-unavailable') : 'disabled',
              reason: `${rawTokens.length} words → ${assignedLevel}`, synonymExpanded: qTokens.length - rawTokens.length },
    order: ORDER,
    totalEntries: entries.length,
    evaluated: res.evaluated,
    hit: res.hit,
    guidance: res.hit ? null : '관련 결과 없음 — 상위 레벨로 확장 검색 필요 (no related results; expand to a higher level)',
    top: res.top.map(t=>({ id:t.entry.id, title:t.entry.title, level:t.lev, feature:t.entry.feature, priority:t.entry.priority, estTokens:t.estTokens, path:t.entry.path, summary:t.entry.summary })),
    tokens: { top: res.topTokens, full: res.fullTokens, saving, avgPerQuery: res.top.length ? Math.round(res.topTokens/res.top.length) : 0 },
    note: `Hierarchical ${ORDER.join('→')} — miss expands to larger levels`,
  };
}

// ── --assign [--save]: 레벨 계산 + 실제 저장 (external review 반영) ──────────
function assignLevel(content, priority=3, affects=[]) {
  const len = content.length, aff = Array.isArray(affects)?affects.length:0;
  if (len<=30 && priority>=4 && aff===0) return 'post-it';
  if (len<=80 && priority>=3) return 'memo';
  if (len<=400) return 'diary';
  if (len<=2000 || aff>=2) return 'bookshelf';
  return 'library';
}
function saveEntry(o) {
  const dirMap = { issue:'bugs', bug:'bugs', learning:'learnings', idea:'ideas', note:'notes',
    decision:'decisions', diary:'diary', todo:'todos', memo:'notes', 'work-history':'code-history', 'overall-flow':'notes' };
  const dir = join(ROOT, dirMap[o.type]||'notes');
  mkdirSync(dir,{recursive:true});
  const date = new Date().toISOString().slice(0,10);
  const fname = `${date}-${String(o.title||o.content).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)}--${o.agent}.md`;
  const path = join(dir,fname);
  const refs = o.refs ? String(o.refs).split(',').map(s=>s.trim()).filter(Boolean) : [];
  const md = [
    `<!-- Path: agent-context/${dirMap[o.type]||'notes'}/${fname} -->`, '---',
    `id: ${o.type}-${date.replace(/-/g,'')}-${Math.random().toString(16).slice(2,10)}`,
    `type: ${o.type}`, `level: ${o.computedLevel}`,
    `title: "${String(o.title||o.content).slice(0,80)}"`,
    `tags: [${o.type}, ${o.feature}]`, `feature: ${o.feature}`, `scope: global`, `agent: ${o.agent}`,
    `created: ${new Date().toISOString()}`, `updated: ${new Date().toISOString()}`,
    `status: done`, `priority: ${o.priority}`,
    `summary: "${String(o.content).slice(0,180)}"`,
    ...(refs.length?['refs:',...refs.map(r=>`  - "${r}"`)]:[]),
    '---','',
    `## 결과\n\n${o.content}\n`,
    `\n<!-- outcome-based: 결론만 저장, 검증은 refs -->`,
  ].join('\n')+'\n';
  writeFileSync(path, md,'utf8');
  spawnSync(process.execPath, [new URL('./agent-context-index.mjs', import.meta.url).pathname], { stdio:'inherit' });
  return { saved:true, path, level:o.computedLevel, tokens: LEVELS[o.computedLevel]?.tokens };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const a = process.argv.slice(2);
const out = { query:null, level:null, limit:5, json:false, assign:false, save:false,
              content:null, priority:3, title:null, type:'note', feature:'global',
              agent:'system', refs:null, benchmark:false, help:false };
for (let i=0;i<a.length;i++){ const v=a[i];
  if(v==='--level') out.level=a[++i];
  else if(v==='--limit') out.limit=Number(a[++i]);
  else if(v==='--json') out.json=true;
  else if(v==='--assign') out.assign=true;
  else if(v==='--save') out.save=true;
  else if(v==='--content') out.content=a[++i];
  else if(v==='--priority') out.priority=Number(a[++i]);
  else if(v==='--title') out.title=a[++i];
  else if(v==='--type') out.type=a[++i];
  else if(v==='--feature') out.feature=a[++i];
  else if(v==='--agent') out.agent=a[++i];
  else if(v==='--refs') out.refs=a[++i];
  else if(v==='--benchmark') out.benchmark=true;
  else if(v==='--min-weight') out.minWeight=Number(a[++i]);
  else if(v==='--help'||v==='-h') out.help=true;
  else if(!v.startsWith('--') && out.query===null && !out.assign) out.query=v;
}
if (__isMain && (out.help || (!out.query && !out.assign && !out.benchmark))) {
  console.log(`Usage:
  node tools/agent-search-lite.mjs "query" [--level L] [--limit N] [--json]
  node tools/agent-search-lite.mjs --assign --content "text" --priority 5
  node tools/agent-search-lite.mjs --assign --save --title "T" --content "결론..." --type issue --feature auth [--refs "a,b"]
  node tools/agent-search-lite.mjs --benchmark
Router: rule-based heuristic (0 LLM). Semantic search is opt-in via config search.semantic.`);
  process.exit(0);
}
if (__isMain && out.assign) {
  if (!out.content) { console.error('--assign requires --content'); process.exit(1); }
  const computedLevel = assignLevel(out.content, out.priority, []);
  if (out.save) {
    if (!out.title) { console.error('--save requires --title'); process.exit(1); }
    console.log(JSON.stringify(saveEntry({ ...out, computedLevel }), null, 2));
  } else {
    console.log(JSON.stringify({ content: out.content.slice(0,40)+'...', priority: out.priority,
      assignedLevel: computedLevel, tokens: LEVELS[computedLevel]?.tokens,
      router:'rule-based heuristic, no LLM',
      hint:'저장은 --save --title "..." 를 추가하세요' }, null, 2));
  }
  process.exit(0);
}
if (__isMain && out.benchmark) {
  const queries = ["auth","token authentication","auth jwt race","overall flow","pagination"];
  const results = [];
  for (const q of queries) {
    const r = await search(q, { limit:3 });
    results.push({ q, level:r.assignedLevel, hit:r.hit, saving:r.tokens.saving, expandedTo:r.expandedTo });
  }
  console.log(JSON.stringify({ benchmark:'live index, hierarchical vs full read', avgHitRate:(results.filter(r=>r.hit).length/results.length*100).toFixed(0)+'%', results }, null, 2));
  process.exit(0);
}
if (__isMain) { const res = await search(out.query, { level: out.level, limit: out.limit, minWeight: out.minWeight });
if (out.json) console.log(JSON.stringify(res, null, 2));
else {
  console.log(`\n🔍 "${res.query}" → 휴리스틱 라우터: ${res.assignedLevel}${res.expandedTo?` (miss→확장: ${res.expandedTo})`:''} | 동의어 +${res.router.synonymExpanded} | semantic:${res.router.semantic}`);
  console.log(`   order: ${res.order.join(' → ')} | total:${res.totalEntries} evaluated:${res.evaluated} | hit:${res.hit?'✅':'❌'} | tokens top:${res.tokens.top} vs full:${res.tokens.full} saving:${res.tokens.saving}`);
  for (const t of res.top) console.log(`   - [${t.level} ${t.feature}] ${t.title} (p${t.priority}) → ${t.path}`);
  if (!res.hit && res.guidance) console.log('   ⚠️ ' + res.guidance);
  console.log('');
}
}
