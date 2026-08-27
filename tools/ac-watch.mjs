#!/usr/bin/env node
// Path: tools/ac-watch.mjs
// Auto-observability — "에이전트가 기록해야만 남는다"는 약점 보완.
// git 이력에서 학습 가치가 있는 신호를 감지해 **entry 후보**를 생성한다.
// 후보는 agent-context/.candidates/ 에 쌓이고, 에이전트가 검토해 결론을 덧붙인 뒤
// 정식 디렉터리로 승격한다. (자동 생성 ≠ 자동 확정 — 오염 방지)
//
// 감지 규칙 (0 LLM):
//   R1 커밋 메시지가 fix|bug|hotfix|regression 포함        → learning 후보
//   R2 커밋에서 tests/** 변경 + 소스 동시 변경              → learning 후보
//   R3 diff 라인 수 200+                                    → work-history 후보
//   R4 결정성 단어(decide|choose|migrate|switch) in message → decision 후보
//
// Usage:
//   node tools/ac-watch.mjs [--since "2 days ago"] [--out dir]
//   node tools/ac-watch.mjs promote <candidate-file>   # .candidates → 정식 위치

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

// Issue #14 fix: require an initialized project in cwd; never silently fall back
// to the source repo (that would pollute the package install / npx cache).
function resolveProjectRoot() {
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'agent-context.config.json')) || existsSync(join(cwd, 'agent-context')))
    return join(cwd, 'agent-context');
  process.stderr.write("agent-context가 초기화되지 않았습니다. 먼저 'agent-context-init.mjs --yes' 를 실행하세요.\n");
  process.stderr.write("(agent-context not initialized in cwd; run 'agent-context-init.mjs --yes' first.)\n");
  process.stderr.write("cwd: " + cwd + "\n");
  process.exit(1);
}
const ROOT = resolveProjectRoot();
const CONFIG = (() => {
  const p = join(process.cwd(), 'agent-context.config.json');
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  return {};
})();
const CAND = join(ROOT, '.candidates');

function git(args) {
  try { return execFileSync('git', args, { cwd: process.cwd(), encoding:'utf8' }); }
  catch { return ''; }
}

function detect({ since = '1 day ago' }) {
  const log = git(['log', `--since=${since}`, '--pretty=%H%x09%s']).trim().split('\n').filter(Boolean);
  const candidates = [];
  for (const line of log) {
    const [hash, subject] = line.split('\t');
    const stat = git(['show','--stat','--pretty=','--name-only',hash]).trim().split('\n');
    const files = stat.filter(f => f && !f.includes('|')).map(f=>f.trim());
    const insertions = Number((git(['show','--shortstat','--pretty=',hash]).match(/(\d+) insertion/)||[0,0])[1]) || 0;
    const touchesTests = files.some(f=>/(tests?|spec)\//i.test(f));
    const touchesSrc = files.some(f=>/\.(ts|js|py|php|go|rs)$/.test(f));
    const s = subject.toLowerCase();

    let type=null, why='';
    if (/fix|bug|hotfix|regression/.test(s)) { type='learning'; why=`R1 fix-signal: "${subject}"`; }
    else if (touchesTests && touchesSrc) { type='learning'; why=`R2 test+src co-change (${files.length} files)`; }
    else if (/decide|choose|migrate|switch to/.test(s)) { type='decision'; why=`R4 decision-signal: "${subject}"`; }
    else if (insertions >= 200) { type='work-history'; why=`R3 large change: ${insertions} insertions`; }

    if (type) candidates.push({
      hash: hash.slice(0,10), subject, type, why,
      insertions, files: files.slice(0,8),
      suggestedPath: `${type === 'decision' ? 'decisions' : type==='learning' ? 'learnings' : 'code-history'}/`,
      refs: [`commit:${hash.slice(0,10)}`],
      title: subject.slice(0,80),
      summary: `[auto-candidate] ${why}. 사람/에이전트가 결론을 덧붙여 승격 필요.`,
    });
  }
  return candidates;
}

function writeCandidates(list) {
  mkdirSync(CAND, { recursive:true });
  const written = [];
  for (const c of list) {
    const fname = `${c.hash}-${c.type}.md`;
    const path = join(CAND, fname);
    if (existsSync(path)) { written.push({ path:`.candidates/${fname}`, skipped:'exists' }); continue; }
    const md = [
      `<!-- Path: agent-context/.candidates/${fname} -->`, '---',
      `id: candidate-${Date.now().toString(36)}`, `type: ${c.type}`, `level: ""`,
      `title: "${c.title.replace(/"/g,"'")}"`, `tags: [candidate, auto-watch]`,
      `feature: global`, `scope: global`, `agent: system`,
      `created: ${new Date().toISOString()}`, `updated: ${new Date().toISOString()}`,
      `status: proposed`, `priority: 2`,
      `epistemic: observed`,
      `summary: "${c.summary.replace(/"/g,"'").slice(0,180)}"`,
      'refs:', ...c.refs.map(r=>`  - "${r}"`),
      '---','',
      `## 감지 근거\n${c.why} (${c.insertions} insertions)\n`,
      `## 다음 단계 (에이전트가 수행)\n`,
      `1. 아래 결론을 채워 넣고 status: proposed → done\n`,
      `2. \`node tools/ac.mjs index\` 재생성\n`,
      `3. 파일을 정식 디렉터리로 이동: \`${c.suggestedPath}\``,
    ].join('\n')+'\n';
    writeFileSync(path, md,'utf8');
    written.push({ path:`.candidates/${fname}`, created:true });
  }
  return written;
}

const a = process.argv.slice(2);
if (a[0] === 'promote') {
  const f = a[1];
  if (!f) { console.error('promote requires <candidate-file>'); process.exit(1); }
  const src = join(CAND, f);
  if (!existsSync(src)) { console.error(`not found: ${src}`); process.exit(1); }
  const content = readFileSync(src,'utf8');
  const m = content.match(/type: ([a-z-]+)/);
  const dirMap = { learning:'learnings', decision:'decisions', 'work-history':'code-history', bug:'bugs' };
  const destDir = join(ROOT, dirMap[m?.[1]] || 'notes');
  mkdirSync(destDir,{recursive:true});
  // Issue(자체 테스트) fix: 해시-prefix 제거만 하면 'learning.md'처럼 타입명만 남는 버그.
  // frontmatter title에서 slug를 만들고 오늘 날짜를 붙인다.
  let title = 'candidate';
  try { const t = readFileSync(src,'utf8').match(/title: "([^"]+)"/); if (t) title = t[1]; } catch {}
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40) || 'entry';
  const destName = `${new Date().toISOString().slice(0,10)}-${slug}--promoted.md`;
  // move via git mv if tracked, else fs rename
  try { execFileSync('git',['mv',src,join(destDir,destName)],{cwd:process.cwd()}); }
  catch {
    renameSync(src, join(destDir,destName));
  }
  console.log(`promoted → ${join(destDir,destName)} (결론을 채운 뒤 node tools/ac.mjs index)`);
  process.exit(0);
}

const sinceIdx = a.indexOf('--since');
const since = sinceIdx !== -1 ? a[sinceIdx+1] : '1 day ago';
const list = detect({ since });
const written = writeCandidates(list);
console.log(JSON.stringify({
  scanned_since: since,
  commits_with_signal: list.length,
  candidates_written: written.filter(w=>w.created).length,
  skipped_existing: written.filter(w=>w.skipped).length,
  out: '.candidates/',
  note: '후보는 제안일 뿐 — 에이전트가 결론을 채우고 promote 해야 정식 기억이 됨 (오염 방지)',
}, null, 2));
