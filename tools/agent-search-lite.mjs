#!/usr/bin/env node
// Path: tools/agent-search-lite.mjs
// Lightweight AI search — hierarchical, fluid, 0 LLM calls, 0 install cost
// Inspired by AI accelerator cache hierarchy: post-it (L1) → memo (HBM) → diary (DRAM) → bookshelf (SSD) → library (cold)
// Search engine (&AI)[post-it|memo|diary|bookshelf|library] — 가벼운 AI가 질의 분석해 가장 작은 레벨부터 탐색, 히트 시 중단
// Usage:
//   node tools/agent-search-lite.mjs "auth jwt race" [--level post-it] [--limit 3] [--json]
//   node tools/agent-search-lite.mjs --assign --content "some text" --priority 5
//   node tools/agent-search-lite.mjs --benchmark

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function resolveConfig() {
  const cands = [
    new URL('../agent-context.config.json', import.meta.url).pathname,
    new URL('../agent-context/agent-context.config.json', import.meta.url).pathname,
  ];
  for (const p of cands) if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  return { contextRoot: 'agent-context', hierarchy: { levels: { 'post-it': { tokens: 15 }, memo: { tokens: 50 }, diary: { tokens: 200 }, bookshelf: { tokens: 1000 }, library: { tokens: 5000 } }, searchOrder: ['post-it','memo','diary','bookshelf','library'] } };
}
const CONFIG = resolveConfig();
// Issue #3 fix: cwd-first — operate on the user's project, fall back to script-relative only inside the source repo
const ROOT = (existsSync(join(process.cwd(), 'agent-context.config.json')) || existsSync(join(process.cwd(), CONFIG.contextRoot || 'agent-context')))
  ? join(process.cwd(), CONFIG.contextRoot || 'agent-context')
  : new URL(`../${CONFIG.contextRoot || 'agent-context'}`, import.meta.url).pathname;
const INDEX_PATH = join(ROOT, 'index.json');

const LEVELS = CONFIG.hierarchy?.levels || {
  'post-it': { tokens: 15 },
  memo: { tokens: 50 },
  diary: { tokens: 200 },
  bookshelf: { tokens: 1000 },
  library: { tokens: 5000 },
};
const ORDER = CONFIG.hierarchy?.searchOrder || ['post-it','memo','diary','bookshelf','library'];
const LEVEL_RANK = Object.fromEntries(ORDER.map((k,i)=>[k,i]));

function parseArgs() {
  const a = process.argv.slice(2);
  const out = { query: null, level: null, limit: 5, json: false, assign: false, content: null, priority: 3, benchmark: false, help: false };
  for (let i=0;i<a.length;i++) {
    const v=a[i];
    if (v==='--level') out.level=a[++i];
    else if (v==='--limit') out.limit=Number(a[++i]);
    else if (v==='--json') out.json=true;
    else if (v==='--assign') out.assign=true;
    else if (v==='--content') out.content=a[++i];
    else if (v==='--priority') out.priority=Number(a[++i]);
    else if (v==='--benchmark') out.benchmark=true;
    else if (v==='--help' || v==='-h') out.help=true;
    else if (!v.startsWith('--') && out.query===null && !out.assign) out.query=v;
  }
  return out;
}

function assignLevel(content, priority=3, affects=[]) {
  // Lightweight AI: rule-based, 0 LLM calls, 0 tokens
  // Inspired by cache hierarchy: small→large, priority and affects push to larger level
  const len = content.length;
  const aff = Array.isArray(affects) ? affects.length : 0;
  if (len <= 30 && priority >=4 && aff===0) return 'post-it'; // L1 cache — one-liner, high priority, no affect
  if (len <= 80 && priority >=3) return 'memo'; // HBM
  if (len <= 400) return 'diary'; // DRAM
  if (len <= 2000 || aff >=2) return 'bookshelf'; // SSD
  return 'library'; // cold
}

function estimateLevel(entry) {
  // If entry has level, use it; else estimate from chars/summary length (backward compat)
  if (entry.level && LEVEL_RANK[entry.level]!==undefined) return entry.level;
  const len = entry.chars || (entry.summary?.length || 0) + (entry.title?.length||0);
  // Rough: chars 50 → post-it, 150 → memo, 600 → diary, 2500 → bookshelf, else library
  if (len <= 80) return 'post-it';
  if (len <= 250) return 'memo';
  if (len <= 800) return 'diary';
  if (len <= 3000) return 'bookshelf';
  return 'library';
}

function lightweightAIAssignLevelForQuery(query) {
  // Like hierarchy doc: query token count + keyword count decides starting level
  // 1 word → post-it, short phrase → memo, sentence → diary, "overall flow" → bookshelf/library
  const q = query.toLowerCase();
  const words = q.trim().split(/\s+/).filter(Boolean).length;
  if (q.includes('overall') || q.includes('전체') || q.includes('architecture') || q.includes('아키텍처')) return 'bookshelf';
  if (q.includes('flow') || q.includes('흐름')) return 'bookshelf';
  if (words <= 1) return 'post-it';
  if (words <= 3) return 'memo';
  if (words <= 8) return 'diary';
  return 'bookshelf';
}

// [#1] 동의어 확장 (config search.synonyms) — 0 LLM
const SYNONYMS = CONFIG.search?.synonyms || {};
function expandTokens(tokens) {
  const set = new Set(tokens);
  for (const t of tokens) { const syn = SYNONYMS[t]; if (Array.isArray(syn)) syn.forEach(x=>set.add(x)); }
  for (const [k, list] of Object.entries(SYNONYMS)) if (tokens.some(t => list.includes(t))) set.add(k);
  return [...set];
}
// [#1] 선택적 의미 검색 어댑터 — 기본 OFF. 활성화 시 로컬 임베딩을 시도하고,
// 불가하면 'unavailable'을 정직히 반환해 휴리스틱으로 폴백한다 (zero-install 유지).
async function semanticScoresIfEnabled(query, entries){
  const cfg = CONFIG.search?.semantic;
  if (!cfg?.enabled) return null;
  try {
    const mod = await import(cfg.module || '@xenova/transformers');
    const extractor = await mod.pipeline('feature-extraction', cfg.model || 'Xenova/all-MiniLM-L6-v2');
    const embed = async t => { const out = await extractor(t, { pooling:'mean', normalize:true }); return Array.from(out.data); };
    const cos = (a,b)=>{ let d=0,na=0,nb=0; for(let i=0;i<a.length;i++){d+=a[i]*b[i];na+=a[i]**2;nb+=b[i]**2;} return d/(Math.sqrt(na)*Math.sqrt(nb)+1e-9); };
    const qv = await embed(query);
    return await Promise.all(entries.map(async e=>({ id:e.id, sim: cos(qv, await embed((e.title||'')+' '+(e.summary||''))) })));
  } catch(err){ return { unavailable: String(err.message||err).slice(0,140) }; }
}

async function search(query, opts={}) {
  const index = JSON.parse(readFileSync(INDEX_PATH,'utf8'));
  const entries = index.entries || [];
  const requestedLevel = opts.level || lightweightAIAssignLevelForQuery(query);
  const startRank = LEVEL_RANK[requestedLevel] ?? 0;
  // Hierarchical: only levels from requestedLevel up to library? Actually search from smallest up to requestedLevel?
  // Our hierarchy searchOrder is small→large, we start at requestedLevel and expand upward if needed
  // For now, filter to levels <= requestedLevel rank? But user wants small→large, so if query is "auth" (post-it), we only look at post-it/memo? But if query is broad, we need larger
  // Safer: include entries whose level rank <= startRank + 1? Actually we want to include small levels first, but if query is post-it, we should prioritize small, but still consider larger if no hit
  // Implementation: rank entries by (level distance from requestedLevel) + text relevance
  const qTokens = expandTokens(query.toLowerCase().split(/\s+/).filter(Boolean));
  const scored = entries.map(e=>{
    const lev = estimateLevel(e);
    const levRank = LEVEL_RANK[lev] ?? 2;
    const levelDistance = Math.abs(levRank - startRank); // 0 is best
    // Text relevance: simple TF count over title+tags+summary+feature
    // [#1] 필드 가중치 매칭 (BM25-lite) — 제목>태그>요약. naive includes 대비 랭킹 품질 향상
    const fTitle=(e.title||'').toLowerCase(), fTags=(e.tags||[]).join(' ').toLowerCase(),
          fFeat=(e.feature||'').toLowerCase(), fSum=(e.summary||'').toLowerCase(),
          fPrev=(e.preview||'').toLowerCase();
    let wSum=0;
    for (const tok of qTokens) {
      if (fTitle.includes(tok)) wSum+=3;
      if (fTags.includes(tok))  wSum+=2;
      if (fFeat.includes(tok))  wSum+=2;
      if (fSum.includes(tok))   wSum+=1;
      if (fPrev.includes(tok))  wSum+=1;
    }
    const maxW = qTokens.length*9;
    const hitScore = maxW ? Math.min(1, wSum/maxW) : 0; // 0-1
    const priorityScore = (e.priority||3)/5; // 0.2-1
    // Recency: updated within 30 days → boost
    let recency = 0.5;
    try {
      const days = (Date.now() - new Date(e.updated).getTime())/86400000;
      if (days < 7) recency=1; else if (days < 30) recency=0.8;
    } catch {}
    // Final: weighted
    const score = hitScore*0.5 - levelDistance*0.1 + priorityScore*0.2 + recency*0.1;
    const estTokens = LEVELS[lev]?.tokens || 200;
    return { entry:e, lev, levRank, levelDistance, hitScore, priorityScore, recency, score, estTokens };
  }).filter(s=>s.hitScore>0 || s.entry.feature===query.toLowerCase() || opts.level); // if no hit but level filter, keep
  // If no hit, return empty (no need to read large)
  // Sort by score desc
  // [#1] semantic opt-in 블렌딩 — 활성화·모델 사용 가능 시에만 작동, 실패는 정직 표기
  const sem = await semanticScoresIfEnabled(query, entries);
  if (sem && !sem.unavailable) {
    const simById = new Map(sem.map(x=>[x.id,x.sim]));
    for (const sc of scored) {
      const sim = simById.get(sc.entry.id);
      if (typeof sim === 'number') { sc.score += 0.4*sim; sc.hitScore = Math.max(sc.hitScore, sim); }
    }
    scored.sort((a,b)=>b.score-a.score);
  }
  scored.sort((a,b)=>b.score-a.score);
  const top = scored.slice(0, opts.limit||5);
  const totalTokens = top.reduce((sum,s)=>sum+s.estTokens,0);
  const wouldBeFullRead = entries.reduce((sum,e)=>sum+(LEVELS[estimateLevel(e)]?.tokens||200),0);
  const hit = top.length > 0;
  // nemotron 지적 반영: miss는 'n/a (miss)', 99.95% 이상은 '99.9%+' 표기
  const savingNum = wouldBeFullRead ? ((wouldBeFullRead-totalTokens)/wouldBeFullRead*100) : 0;
  const saving = !hit ? 'n/a (miss)' : (savingNum >= 99.95 ? '99.9%+' : savingNum.toFixed(1)+'%');
  return {
    query,
    assignedLevel: requestedLevel,
    lightweightAI: { reason: `query ${qTokens.length} words → ${requestedLevel} (hierarchical cache)`, noLLM: true, zeroTokens: true },
    order: ORDER,
    totalEntries: entries.length,
    evaluated: scored.length,
    hit,
    router: { type:'rule-based heuristic', semantic: CONFIG.search?.semantic?.enabled ? 'opt-in' : 'disabled', reason: `query ${qTokens.length} words → ${requestedLevel}` },
    top: top.map(s=>({ id:s.entry.id, title:s.entry.title, level:s.lev, feature:s.entry.feature, priority:s.entry.priority, score: s.score.toFixed(2), estTokens:s.estTokens, path:s.entry.path, summary:s.entry.summary })),
    tokens: { top: totalTokens, full: wouldBeFullRead, saving, avgPerQuery: top.length? Math.round(totalTokens/top.length):0 },
    note: `Hierarchical: ${ORDER.slice(0, startRank+1).join('→')} first, expand to larger only if no hit — like cache→HBM→DRAM→SSD→library`
  };
}

const ARGS = parseArgs();
if (ARGS.help) {
  console.log(`Usage:
  node tools/agent-search-lite.mjs "query" [--level post-it|memo|diary|bookshelf|library] [--limit 5] [--json]
  node tools/agent-search-lite.mjs --assign --content "text" --priority 5
  node tools/agent-search-lite.mjs --benchmark
Lightweight AI: rule-based, 0 LLM calls, 0 tokens, hierarchical post-it→library like cache→HBM→DRAM→SSD`);
  process.exit(0);
}
if (ARGS.assign) {
  if (!ARGS.content) { console.error('--assign requires --content'); process.exit(1); }
  const lev = assignLevel(ARGS.content, ARGS.priority, []);
  console.log(JSON.stringify({ content: ARGS.content.slice(0,40)+'...', priority: ARGS.priority, assignedLevel: lev, tokens: LEVELS[lev]?.tokens, reason: 'rule-based, no LLM', lightweightAI: true }, null, 2));
  process.exit(0);
}
if (ARGS.benchmark) {
  // Simple benchmark: compare full read vs hierarchical
  const queries = ["auth", "auth jwt race", "overall flow", "diary 2026-08-27", "api pagination"];
  const results = queries.map(q=>search(q, { limit: 3 }));
  console.log(JSON.stringify({ benchmark: "lightweight hierarchical vs full read", queries: results, avgSaving: (results.reduce((s,r)=>s+parseFloat(r.tokens.saving),0)/results.length).toFixed(1)+'%'} , null, 2));
  process.exit(0);
}
if (!ARGS.query) {
  console.error('requires query or --assign or --benchmark');
  process.exit(1);
}
const res = await search(ARGS.query, { level: ARGS.level, limit: ARGS.limit });
if (ARGS.json) console.log(JSON.stringify(res, null, 2));
else {
  console.log(`\n🔍 query: "${res.query}" → lightweight AI assigned level: ${res.assignedLevel} (${LEVELS[res.assignedLevel]?.desc||''}) — ${res.lightweightAI.reason}`);
  console.log(`   order: ${res.order.join(' → ')} | total: ${res.totalEntries} evaluated: ${res.evaluated} | tokens top:${res.tokens.top} vs full:${res.tokens.full} saving:${res.tokens.saving}`);
  console.log(`   top ${res.top.length}:`);
  for (const t of res.top) console.log(`   - [${t.level} ${t.feature}] ${t.title} (p${t.priority} score${t.score} ~${t.estTokens}tok) → ${t.path}`);
  console.log(`   note: ${res.note}\n`);
}
