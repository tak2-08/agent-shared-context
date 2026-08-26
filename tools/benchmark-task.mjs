#!/usr/bin/env node
// Path: tools/benchmark-task.mjs
// Task-success benchmark (#4) — 토큰 절약이 아니라 "검색이 실제 과제를 도왔는가"를 잰다.
//
// 방법 (정직한 프록시 — 실제 코딩 성공률은 라이브 에이전트 필요):
//   각 entry를 하나의 미니 과제로 본다. 질의 = 제목 키워드(스톱워드 제외),
//   정답(oracle) = 그 entry의 path. 계층 검색이 limit 내에 oracle을 반환하면 성공.
//   측정: task accuracy(%) · 평균 소비 토큰 · flat-read 대비 절약.
//
// 한계 명시: 이것은 retrieval 정확도의 상한 추정이며, AgentRadio식
// "실제 버그 수정 성공률"로 가려면 라이브 에이전트 하네스가 필요하다. → ROADMAP P1.
//
// Run: node tools/benchmark-task.mjs [--limit 3] [--json]

import { readFileSync } from 'node:fs';

const cfgPath = new URL('../agent-context.config.json', import.meta.url).pathname;
const CONFIG = exists(cfgPath) ? JSON.parse(readFileSync(cfgPath,'utf8')) : {};
function exists(p){ try { readFileSync(p); return true; } catch { return false; } }

const ROOT = new URL('../agent-context', import.meta.url).pathname;
const idx = JSON.parse(readFileSync(join(ROOT,'index.json'),'utf8'));
function join(a,b){ return a+'/'+b; }

const LEVEL_TOKENS = CONFIG.hierarchy?.levels ? Object.fromEntries(Object.entries(CONFIG.hierarchy.levels).map(([k,v])=>[k,v.tokens])) : { 'post-it':15, memo:50, diary:200, bookshelf:1000, library:5000 };

const STOP = new Set(['the','a','an','of','on','in','to','and','or','for','with','is','was','not','fix','bug','test','issue']);
function keywords(title){
  return title.toLowerCase().replace(/[^a-z0-9가-힣\s-]/g,' ').split(/\s+/)
    .filter(w=>w.length>1 && !STOP.has(w)).slice(0,4);
}

async function main(){
  const { search } = await import('./agent-search-lite.mjs');
  const tasks = idx.entries.filter(e => (e.priority||3) >= 2 && keywords(e.title).length >= 1);
  const limit = Number(process.argv.includes('--limit') ? process.argv[process.argv.indexOf('--limit')+1] : 3);
  let success=0, tokens=0;
  const detail=[];
  const flatTokens = idx.entries.reduce((s,e)=>{
    const t = LEVEL_TOKENS[e.level] ?? 200; return s+t;
  }, 0);

  for (const t of tasks) {
    const q = keywords(t.title).join(' ');
    const r = await search(q, { limit });
    const hit = r.top.some(x => x.path === t.path);
    // 소비 토큰 = 검색 결과로 연 Read 토큰(hit 시 oracle 포함 top 합) or miss 시 full read 강제
    const used = hit ? r.top.reduce((s,x)=>s+x.estTokens,0) : flatTokens;
    if (hit) success++;
    tokens += used;
    detail.push({ task:t.id, query:q, hit, usedTokens:used, oracle:t.path });
  }
  const n = tasks.length || 1;
  const summary = {
    metric: 'retrieval-task success (proxy for agent task success)',
    tasks: n,
    accuracy: (success/n*100).toFixed(1)+'%',
    avgTokensPerTask: Math.round(tokens/n),
    flatReadTokensPerTask: Math.round(flatTokens),
    savingVsFlat: flatTokens? ((flatTokens*n-tokens)/(flatTokens*n)*100).toFixed(1)+'%' : 'n/a',
    honesty_note: '이 수치는 "검색→정답 파일 도달" 프록시다. 실제 작업 성공률(버그 수정 등)은 라이브 에이전트 하네스 필요 — ROADMAP P1.',
  };
  if (process.argv.includes('--json')) console.log(JSON.stringify({summary, detail},null,2));
  else {
    console.log(JSON.stringify(summary,null,2));
    // BENCHMARK.md 부착
    try {
      const fsMod = await import('node:fs');
      const p = new URL('../BENCHMARK.md', import.meta.url).pathname;
      let md = fsMod.readFileSync(p,'utf8');
      if (!md.includes('## Task-success benchmark')) {
        md += `\n## Task-success benchmark (#4 프록시)\n\n\`\`\`json\n${JSON.stringify(summary,null,2)}\n\`\`\`\n\n> 실행: \`node tools/benchmark-task.mjs\`. 위 지표는 "질의→정답 파일 도달" 프록시이며, 실제 작업 성공률은 라이브 에이전트 하네스 과제 (ROADMAP P1).\n`;
        fsMod.writeFileSync(p, md);
        console.log('Appended to BENCHMARK.md');
      }
    } catch {}
  }
}
main();
