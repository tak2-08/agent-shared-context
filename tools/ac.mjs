#!/usr/bin/env node
// Path: tools/ac.mjs
// Single dispatcher for all agent-shared-context commands (skill command layer).
// Slash-style commands in SKILL.md map 1:1 to these subcommands — one Bash call.
//
// Outcome-based logging principle: entries record CONCLUSIONS + pointers,
// not tool-call transcripts. "used tool X" is noise; "result was Y, verify at Z"
// is signal. refs[] holds verification links.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const TOOLS = new URL('.', import.meta.url).pathname;
const args = process.argv.slice(2);
const cmd = args[0];
const rest = args.slice(1);

function run(tool, passthrough) {
  const r = spawnSync(process.execPath, [join(TOOLS, tool), ...passthrough], { stdio: 'inherit' });
  process.exit(r.status ?? 0);
}
function getFlag(name) {
  const i = rest.indexOf(name);
  return i !== -1 ? rest[i + 1] : null;
}
function csvFlag(name) {
  const v = getFlag(name);
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
}
function today() { return new Date().toISOString().slice(0, 10); }
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'entry';
}
// Issue #10 fix: YAML-safe double-quoted scalar — escape \ and ", flatten CR/LF,
// so user input (title/summary/refs) can never break out of the frontmatter block
// and inject arbitrary YAML fields (e.g. priority override via embedded newline).
function yq(s) {
  return '"' + String(s).replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
// Issue #10 fix: filename-safe component — strip path separators / reserved chars
// so --agent or title can never traverse directories or break the path.
function fnamePart(s) {
  return String(s).replace(/[\/\\:*?"<>|]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
}
function resolveRoot() {
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'agent-context.config.json')) || existsSync(join(cwd, 'agent-context')))
    return join(cwd, 'agent-context');
  return new URL('../agent-context', import.meta.url).pathname; // source-repo fallback
}
function pluralDir(type) {
  const map = { issue: 'bugs', bug: 'bugs', learning: 'learnings', idea: 'ideas', note: 'notes',
    decision: 'decisions', diary: 'diary', todo: 'todos', 'code-history': 'code-history',
    memo: 'notes', 'work-history': 'code-history', 'overall-flow': 'notes' };
  return map[type] || 'notes';
}
function nextId(type) {
  // Issue #10 fix: pad the random hex to 8 chars so it always matches idPattern
  // (^[a-z-]+-[0-9]{8}-[a-z0-9]{8}$) — Math.random().toString(16) can be shorter.
  return `${type}-${today().replace(/-/g, '')}-${Math.random().toString(16).slice(2, 10).padEnd(8, '0')}`;
}

// Generic entry creator — outcome-based template with refs field
function createEntry(opts) {
  const { type, title, feature = 'global', agent = 'system', status = 'done',
          priority = 3, summary, body = '', refs = [] } = opts;
  const root = resolveRoot();
  const dir = pluralDir(type);
  const targetDir = join(root, dir);
  mkdirSync(targetDir, { recursive: true });
  const id = nextId(type);
  // Issue #10 fix: unique filenames. slug() strips non-ASCII, so Korean/CJK/emoji
  // titles all collapse to 'entry' — silently overwriting each other (data loss).
  // If the slug fell back, or the computed filename already exists, disambiguate
  // with the random hex from the entry id.
  const idHex = id.split('-').pop();
  let fname;
  const baseSlug = slug(title);
  const uniqSlug = baseSlug === 'entry' ? `entry-${idHex}` : baseSlug;
  if (type === 'decision') {
    let n = 1;
    try { n = readdirSync(targetDir).filter(f => /^\d{4}-/.test(f)).length + 1; } catch {}
    fname = `${String(n).padStart(4, '0')}-${uniqSlug}.md`;
  } else if (type === 'diary') {
    fname = `${today()}.md`;
  } else {
    fname = `${today()}-${uniqSlug}--${fnamePart(agent)}.md`;
  }
  if (type !== 'diary' && existsSync(join(targetDir, fname))) {
    // same-day same-title collision — never overwrite an existing entry
    fname = fname.replace(/\.md$/, `-${idHex}.md`);
  }
  const path = join(targetDir, fname);
  if (existsSync(path) && type === 'diary') {
    // diary append-only: append a section instead of failing
    const prev = readdirSync(targetDir).includes(fname)
      ? readFileSync(path, 'utf8') : '';
    writeFileSync(path, prev + `\n## ${new Date().toTimeString().slice(0,5)} ${agent} — ${title}\n- ${summary}\n`, 'utf8');
  } else {
    const lines = [
      `<!-- Path: agent-context/${dir}/${fname} -->`,
      '---',
      `id: ${id}`,
      `type: ${type}`,
      `title: ${yq(String(title).slice(0, 80))}`,
      `tags: [${type}]`,
      `feature: ${yq(feature)}`,
      `level: ""`,
      `scope: global`,
      `agent: ${yq(agent)}`,
      `created: ${new Date().toISOString()}`,
      `updated: ${new Date().toISOString()}`,
      `status: ${yq(status)}`,
      `priority: ${Number.isInteger(priority) && priority >= 1 && priority <= 5 ? priority : 3}`,
      `summary: ${yq(String(summary || title).slice(0, 180))}`,
    ];
    if (refs.length) {
      lines.push('refs:');
      refs.forEach(r => lines.push(`  - ${yq(r)}`));
    }
    lines.push('---', '', body || '## 결과\n\n(도구 호출 로그 아님 — 결론만 기록. 검증은 refs 링크로)\n');
    writeFileSync(path, lines.join('\n') + '\n', 'utf8');
  }
  // regenerate index so level auto-assign runs
  spawnSync(process.execPath, [join(TOOLS, 'agent-context-index.mjs')], { stdio: 'inherit' });
  console.log(`created: ${path}`);
}

const HELP = `Usage: node tools/ac.mjs <command> [args]

세션 명령:
  export   --session NAME --task "..." [--done "a;b"] [--next "..."]   세션 내보내기
  import   [file]                                                      세션 불러오기
  current                                                             현재 포인터

기록 명령 (결과 중심 — 도구 로그 아님):
  issue    --title "..." [--feature F] [--agent A] [--summary "..."] [--refs a,b]
  learning --title "..." [--cause C] [--fix F2] [--lesson L] [동일 옵션]
  idea     --title "..." [--summary "..."]
  note     --title "..." [--summary "..."]
  todo     --title "..." [--status open]
  decision --title "..." [--summary "..."]
  history  "query" [--limit N] [--level L]

옵션 공통: --feature F --agent A(claude|codex|opencode|human|system) --priority N --refs "p1,p2"

원칙: 기록에는 '결론 + 확인 링크(refs)'만 남긴다. 도구 실행 과정·출력 전문은 저장하지 않는다.`;

switch (cmd) {
  case 'export':  run('agent-handoff.mjs', ['save', ...rest]); break;
  case 'import':  run('agent-handoff.mjs', ['load', ...rest]); break;
  case 'current': run('agent-handoff.mjs', ['current']); break;
  case 'history':
  case 'search':  run('agent-search-lite.mjs', rest); break;
  case 'index':   run('agent-context-index.mjs', rest); break;
  case 'validate':run('agent-context-validate.mjs', rest); break;
  case 'issue':
  case 'learning':
  case 'idea':
  case 'note':
  case 'todo':
  case 'decision': {
    const title = getFlag('--title');
    if (!title) { console.error(`${cmd} requires --title "..."`); process.exit(1); }
    createEntry({
      type: cmd === 'issue' ? 'issue' : cmd,
      title,
      feature: getFlag('--feature') || 'global',
      agent: getFlag('--agent') || 'system',
      status: cmd === 'todo' ? (getFlag('--status') || 'open')
            : cmd === 'idea' ? (getFlag('--status') || 'proposed')
            : (getFlag('--status') || 'done'),
      priority: Number(getFlag('--priority') || (cmd === 'issue' ? 4 : 3)),
      summary: getFlag('--summary'),
      refs: csvFlag('--refs'),
      body: [
        cmd === 'learning' && getFlag('--cause') ? `## 원인\n${getFlag('--cause')}` : null,
        cmd === 'learning' && getFlag('--fix') ? `## 해결\n${getFlag('--fix')}` : null,
        cmd === 'learning' && getFlag('--lesson') ? `## 교훈\n${getFlag('--lesson')}` : null,
        getFlag('--body') ? `## 결과\n${getFlag('--body')}` : null,
        refsNote(csvFlag('--refs')),
      ].filter(Boolean).join('\n\n'),
    });
    break;
  }
  case '--help': case '-h': default:
    console.log(HELP);
}
function refsNote(refs) {
  if (!refs.length) return '';
  return `---\n**검증 링크**: ${refs.map(r => `\`${r}\``).join(' · ')}`;
}
