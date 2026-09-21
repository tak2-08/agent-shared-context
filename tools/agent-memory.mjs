#!/usr/bin/env node
// Path: tools/agent-memory.mjs
// Per-user long-term memory for agent-shared-context.
// Each user gets their OWN GitHub repo (auto-created on first use).
// No central shared repo — data stays on user's GitHub account.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

// ── cwd-first resolution ───────────────────────────────────────────────────────
function resolveRoot() {
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'agent-context.config.json')) || existsSync(join(cwd, 'agent-context')))
    return join(cwd, 'agent-context');
  process.stderr.write("agent-context가 초기화되지 않았습니다. 먼저 'agent-context-init.mjs --yes' 를 실행하세요.\n");
  process.exit(1);
}
const ROOT = resolveRoot();
const CONFIG_PATH = join(process.cwd(), 'agent-context.config.json');
const MEMORY_DIR = join(ROOT, 'memory');
const MEMORY_DAILY_DIR = join(MEMORY_DIR, 'daily');
const MEMORY_FILE = join(MEMORY_DIR, 'MEMORY.md');

function ensureDirs() {
  mkdirSync(MEMORY_DIR, { recursive: true });
  mkdirSync(MEMORY_DAILY_DIR, { recursive: true });
}
ensureDirs();

function today() { return new Date().toISOString().slice(0, 10); }
function now() { return new Date().toISOString(); }
function todayFile() { return join(MEMORY_DAILY_DIR, `${today()}.md`); }

function readConfig() {
  if (existsSync(CONFIG_PATH)) return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  return {};
}
function writeConfig(cfg) {
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

// ── GitHub memory repo management (dynamic per-user) ───────────────────────────
// Flow on every operation:
//   1. GitHub 접근 권한 확인: `gh auth status` + `gh api user` (username 확보)
//   2. repo 존재 확인: config에 저장된 repo가 있으면 `gh repo view`로 검증 후 바로 사용
//   3. 없으면 `<username>/agent-shared-context-memory` 존재 확인 → 있으면 바로 사용,
//      없으면 private 생성 (`gh repo create --private`)
//   4. 로컬 clone 확인 (없으면 clone, 있으면 pull) 후 사용
// 모든 기억은 유저 개인 repo에만 저장된다. 중앙 repo는 사용하지 않는다.
const DYNAMIC_REPO_NAME = 'agent-shared-context-memory';

function getMemoryRepo(config) {
  return config.memory?.repo || null;
}

function setMemoryRepo(config, repo) {
  if (!config.memory) config.memory = {};
  config.memory.repo = repo;
  writeConfig(config);
  return repo;
}

function getMemoryLocalPath(config) {
  return config.memory?.localPath || join(process.env.HOME || '~', '.cache', 'agent-memory', 'repo');
}

// Step 1 — GitHub 접근 권한 확인 (username 포함)
function checkGhAuth() {
  const st = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
  if (st.status !== 0) {
    return { ok: false, username: null, error: 'GitHub CLI(gh) 인증 필요. `gh auth login` 실행 후 다시 시도하거나, 수동으로 레포를 생성해 config에 추가하세요.' };
  }
  const username = getGhUsername();
  if (!username) {
    return { ok: false, username: null, error: 'GitHub 사용자 확인 실패 (`gh api user`). `gh auth login --scopes repo` 후 다시 시도하세요.' };
  }
  return { ok: true, username, error: null };
}

// Step 2 — repo 존재 확인 (이름 + 공개범위까지 검증)
function repoExists(fullRepo) {
  try {
    const r = spawnSync('gh', ['repo', 'view', fullRepo, '--json', 'name,visibility'], { encoding: 'utf8' });
    if (r.status !== 0 || !r.stdout.trim()) return { exists: false };
    const info = JSON.parse(r.stdout);
    return { exists: true, visibility: info.visibility || null };
  } catch {
    return { exists: false };
  }
}

// Step 3b — 없으면 private 생성 (이미 존재 race는 존재로 간주)
function createPrivateRepo(fullRepo) {
  const result = spawnSync('gh', ['repo', 'create', fullRepo, '--private', '--description', 'Personal agent-shared-context memory store'], { encoding: 'utf8' });
  if (result.status === 0) {
    console.log(`   ✅ 생성 완료: https://github.com/${fullRepo}`);
    return { created: true, error: null };
  }
  // 생성 실패 → 이미 존재하는지 재확인 (두 번째 머신 등)
  const check = repoExists(fullRepo);
  if (check.exists) {
    console.log(`   이미 존재함: ${fullRepo} → 바로 사용`);
    return { created: false, error: null };
  }
  return { created: false, error: `레포 생성 실패: ${(result.stderr || result.stdout || '').trim()}` };
}

// Step 4 — 로컬 clone 확인 (없으면 clone, origin 불일치면 오류, 있으면 pull)
function ensureLocalClone(repo, localPath) {
  if (!existsSync(join(localPath, '.git'))) {
    if (existsSync(localPath)) {
      return { ok: false, error: `로컬 경로가 git 저장소가 아님: ${localPath} (비워두거나 삭제 후 재시도)` };
    }
    mkdirSync(dirname(localPath), { recursive: true });
    let r = spawnSync('gh', ['repo', 'clone', repo, localPath], { encoding: 'utf8' });
    if (r.status !== 0) {
      r = spawnSync('git', ['clone', `https://github.com/${repo}.git`, localPath], { encoding: 'utf8' });
      if (r.status !== 0) {
        return { ok: false, error: `clone 실패: ${(r.stderr || r.stdout || '').trim()}` };
      }
    }
    return { ok: true, error: null };
  }
  // 기존 clone — origin이 원하는 repo와 같은지 검증 (다른 repo를 조용히 쓰지 않음)
  try {
    const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: localPath, encoding: 'utf8' });
    const origin = (r.stdout || '').trim().replace(/^git@github\.com:/i, '').replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').toLowerCase();
    if (origin && origin !== repo.toLowerCase()) {
      return { ok: false, error: `로컬 clone의 origin(${origin})이 메모리 repo(${repo})와 다름. localPath를 비우거나 config.memory를 수정 후 재시도` };
    }
  } catch { /* origin 확인 불가 — pull 시도 */ }
  pullMemory(localPath);
  return { ok: true, error: null };
}

async function ensureMemoryRepo() {
  const config = readConfig();

  // 설정된 repo가 있으면 존재 검증 후 바로 사용 (stale 설정은 재확인)
  const configured = getMemoryRepo(config);
  if (configured) {
    const check = repoExists(configured);
    if (check.exists) {
      const localPath = getMemoryLocalPath(config);
      const cl = ensureLocalClone(configured, localPath);
      if (!cl.ok) return { error: cl.error };
      return { repo: configured, localPath };
    }
    console.log(`⚠️  설정된 메모리 repo(${configured})에 접근 불가 — per-user repo를 다시 확인합니다...`);
  }

  // Step 1 — 권한 확인
  const auth = checkGhAuth();
  if (!auth.ok) return { error: auth.error };
  const fullRepo = `${auth.username}/${DYNAMIC_REPO_NAME}`;

  // Step 2/3 — 존재 확인 → 있으면 바로 사용, 없으면 생성
  const check = repoExists(fullRepo);
  if (check.exists) {
    if (check.visibility && check.visibility !== 'PRIVATE') {
      console.log(`⚠️  ${fullRepo} 가 ${check.visibility} 상태 — private 권장`);
    }
  } else {
    console.log(`🧠 메모리 저장소가 없습니다. GitHub에 개인 메모리 레포를 생성합니다: ${fullRepo} (private)...`);
    const created = createPrivateRepo(fullRepo);
    if (created.error) return { error: created.error };
  }

  // Step 4 — 로컬 clone
  const localPath = getMemoryLocalPath(config);
  const cl = ensureLocalClone(fullRepo, localPath);
  if (!cl.ok) return { error: cl.error };

  // Initialize MEMORY.md + daily if empty
  await initMemoryRepo(localPath);

  setMemoryRepo(config, fullRepo);
  const fresh = readConfig();
  if (!fresh.memory.localPath) {
    fresh.memory.localPath = localPath;
    writeConfig(fresh);
  }
  return { repo: fullRepo, localPath };
}

function getGhUsername() {
  try {
    const r = spawnSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  } catch {}
  return null;
}

async function initMemoryRepo(localPath) {
  const memoryMd = join(localPath, 'MEMORY.md');
  if (!existsSync(memoryMd)) {
    writeFileSync(memoryMd, `# MEMORY.md — Personal Long-term Memory\n\n> Curated durable facts, preferences, decisions for agent-shared-context.\n> Backed by your GitHub repo.\n\n## Memory system\n- Personal store: GitHub repo (private), created on first use.\n- Local cache: ${localPath}\n- Sync: pull → operate → push on every operation.\n\n`, 'utf8');
  }
  const dailyDir = join(localPath, 'daily');
  mkdirSync(dailyDir, { recursive: true });
}

function pullMemory(localPath) {
  const r = spawnSync('git', ['-C', localPath, 'pull', '--rebase', '--autostash'], { encoding: 'utf8', stdio: 'ignore' });
  return r.status === 0;
}

// Scoped push: MEMORY.md + daily/ 만 commit (git add -A 금지 — 캐시에 떨어진
// 무관한 파일까지 커밋되는 것을 방지). git identity가 없어도 동작하도록 gh
// 유저 기반으로 -c 주입. {pushed, error} 반환 — 호출자가 sync 상태를 보고한다.
function pushMemory(localPath, message = 'chore: memory sync') {
  const id = gitIdentityArgs();
  const add = spawnSync('git', ['-C', localPath, 'add', 'MEMORY.md', 'daily'], { encoding: 'utf8', stdio: 'ignore' });
  if (add.status !== 0) return { pushed: false, error: 'git add (MEMORY.md daily) 실패' };
  const status = spawnSync('git', ['-C', localPath, 'status', '--porcelain', '--', 'MEMORY.md', 'daily'], { encoding: 'utf8' });
  if (!status.stdout.trim()) return { pushed: true, error: null }; // 변경 없음
  const commit = spawnSync('git', ['-C', localPath, ...id, 'commit', '-m', message], { encoding: 'utf8', stdio: 'ignore' });
  if (commit.status !== 0) return { pushed: false, error: 'git commit 실패' };
  const push = spawnSync('git', ['-C', localPath, 'push'], { encoding: 'utf8', stdio: 'ignore' });
  if (push.status !== 0) return { pushed: false, error: 'git push 실패 (오프라인 또는 remote 충돌 — 로컬 기록은 유지됨)' };
  return { pushed: true, error: null };
}

// git 전역 identity가 없는 머신에서도 commit이 되도록 gh 유저 기반 주입
function gitIdentityArgs() {
  const user = getGhUsername() || 'agent-shared-context';
  return ['-c', `user.name=${user}`, '-c', `user.email=${user}@users.noreply.github.com`];
}

// ── Memory operations ──────────────────────────────────────────────────────────
function readMemoryFile(path) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

function writeMemoryFile(path, content, mode = 'append') {
  if (mode === 'append') {
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
    writeFileSync(path, existing + (existing && !existing.endsWith('\n') ? '\n' : '') + content + '\n', 'utf8');
  } else {
    writeFileSync(path, content + '\n', 'utf8');
  }
}

// Public API
export async function memorySearch(query, opts = {}) {
  const { repo, localPath, error } = await ensureMemoryRepo();
  if (error) return { error, results: [] };
  pullMemory(localPath);
  
  const memoryMd = readMemoryFile(join(localPath, 'MEMORY.md'));
  const dailyFiles = existsSync(join(localPath, 'daily')) 
    ? readdirSync(join(localPath, 'daily')).filter(f => f.endsWith('.md')).sort().reverse() 
    : [];
  
  // Simple keyword search (can be enhanced with FTS later)
  const allText = memoryMd + '\n' + dailyFiles.slice(0, opts.maxDays || 30).map(f => 
    readMemoryFile(join(localPath, 'daily', f))
  ).join('\n');
  
  const lines = allText.split('\n');
  const results = [];
  const queryLower = query.toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(queryLower)) {
      results.push({ line: i + 1, text: lines[i].slice(0, 200), context: lines.slice(Math.max(0, i-2), i+3).join('\n') });
      if (results.length >= (opts.maxResults || 10)) break;
    }
  }
  return { repo, results, totalLines: lines.length };
}

export async function memoryGet(path, opts = {}) {
  const { repo, localPath, error } = await ensureMemoryRepo();
  if (error) return { error };
  pullMemory(localPath);
  
  let fullPath;
  if (path === 'MEMORY.md' || path === 'memory') {
    fullPath = join(localPath, 'MEMORY.md');
  } else if (path === 'daily' || path === 'memory/daily' || path === today()) {
    fullPath = join(localPath, 'daily', `${today()}.md`);
  } else if (path.startsWith('daily/') || path.startsWith('memory/daily/')) {
    fullPath = join(localPath, path.replace(/^(daily|memory\/daily)\/?/, ''));
  } else {
    fullPath = join(localPath, path);
  }
  
  if (!existsSync(fullPath)) return { error: 'not found', path: fullPath };
  
  const lines = readFileSync(fullPath, 'utf8').split('\n');
  const from = (opts.from || 1) - 1;
  const to = from + (opts.lines || 80);
  return { repo, path: fullPath, lines: lines.slice(from, to), totalLines: lines.length };
}

export async function memoryWrite(path, content, mode = 'append') {
  const { repo, localPath, error } = await ensureMemoryRepo();
  if (error) return { error };
  pullMemory(localPath);
  
  const fullPath = path === 'daily' || path === 'memory/daily' || path === today()
    ? join(localPath, 'daily', `${today()}.md`)
    : path === 'MEMORY.md' || path === 'memory'
      ? join(localPath, 'MEMORY.md')
      : join(localPath, path);
  
  writeMemoryFile(fullPath, content, mode);
  const push = pushMemory(localPath, `chore: memory write ${path}`);
  return { repo, path: fullPath, written: true, synced: push.pushed, syncWarning: push.error || undefined };
}

export async function memoryStatus() {
  const auth = checkGhAuth();
  const { repo, localPath, error } = await ensureMemoryRepo();
  if (error) return { error, ghUser: auth.username || null, ghAuth: auth.ok };
  pullMemory(localPath);

  const memSize = existsSync(join(localPath, 'MEMORY.md'))
    ? readFileSync(join(localPath, 'MEMORY.md'), 'utf8').length : 0;
  const dailyCount = existsSync(join(localPath, 'daily'))
    ? readdirSync(join(localPath, 'daily')).filter(f => f.endsWith('.md')).length : 0;
  const visibility = repoExists(repo).visibility || null;

  return { repo, localPath, memoryMdBytes: memSize, dailyFiles: dailyCount, lastSync: now(),
    ghUser: auth.username || null, ghAuth: auth.ok, repoExists: true, repoVisibility: visibility, syncEnabled: true };
}

export async function memoryDream(opts = {}) {
  const { repo, localPath, error } = await ensureMemoryRepo();
  if (error) return { error };
  pullMemory(localPath);
  
  const dailyDir = join(localPath, 'daily');
  if (!existsSync(dailyDir)) return { promotions: [] };
  
  const files = readdirSync(dailyDir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, opts.days || 7);
  const promotions = [];
  
  for (const f of files) {
    const content = readFileSync(join(dailyDir, f), 'utf8');
    // Heuristic: lines with REMEMBER, DECISION, 선호, 항상, 절대, 승인, 규칙
    const lines = content.split('\n');
    for (const line of lines) {
      if (/REMEMBER|DECISION|선호|항상|절대|승인|규칙|중요|기준|policy/i.test(line)) {
        promotions.push({ source: `daily/${f}`, line: line.trim().slice(0, 200) });
      }
    }
  }
  return { repo, promotions, scannedFiles: files.length };
}

// ── CLI ────────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  
  const HELP = `Usage: node tools/agent-memory.mjs <command> [args]

Per-user GitHub-backed memory (auto-creates your private repo on first use).

Commands:
  search "query"           Search MEMORY.md + daily notes
  get [path] [--from N] [--lines N]  Read exact excerpt (path: MEMORY.md, daily, or daily/YYYY-MM-DD.md)
  write [path] "content"   Append to daily (default) or MEMORY.md (path=MEMORY.md)
  status                   Show repo, local path, sizes
  dream [--days N]         Scan recent daily for promotion candidates (REMEMBER, DECISION, etc.)
  init                     Force (re)initialize memory repo
  repo                     Show current memory repo URL

Examples:
  node tools/agent-memory.mjs search "API migration"
  node tools/agent-memory.mjs get MEMORY.md
  node tools/agent-memory.mjs write daily "오늘 결정: JWT는 RS256만 허용"
  node tools/agent-memory.mjs write MEMORY.md "## 결정\n- JWT 알고리즘: RS256 고정"
  node tools/agent-memory.mjs dream --days 7
`;
  
  if (!cmd || cmd === '--help' || cmd === '-h') { console.log(HELP); process.exit(0); }
  
  function getFlag(name) { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; }
  
  function failIfError(res) {
    if (res && res.error) { console.log(JSON.stringify(res, null, 2)); process.exit(1); }
    return res;
  }

  if (cmd === 'search') {
    const q = args[1] || getFlag('--query');
    if (!q) { console.error('search requires query'); process.exit(1); }
    const res = await memorySearch(q, { maxResults: Number(getFlag('--max') || 10), maxDays: Number(getFlag('--days') || 30) });
    console.log(JSON.stringify(failIfError(res), null, 2));
  } else if (cmd === 'get') {
    const path = args[1] || 'MEMORY.md';
    const res = await memoryGet(path, { from: Number(getFlag('--from') || 1), lines: Number(getFlag('--lines') || 80) });
    console.log(JSON.stringify(failIfError(res), null, 2));
  } else if (cmd === 'write') {
    const path = args[1] || 'daily';
    const content = args.slice(2).join(' ') || getFlag('--content');
    if (!content) { console.error('write requires content'); process.exit(1); }
    const res = await memoryWrite(path, content, getFlag('--mode') || 'append');
    console.log(JSON.stringify(failIfError(res), null, 2));
    if (res && res.syncWarning) process.exit(2); // 로컬 기록은 됐으나 GitHub 동기화 실패
  } else if (cmd === 'status') {
    const res = await memoryStatus();
    console.log(JSON.stringify(failIfError(res), null, 2));
  } else if (cmd === 'dream') {
    const res = await memoryDream({ days: Number(getFlag('--days') || 7) });
    console.log(JSON.stringify(failIfError(res), null, 2));
  } else if (cmd === 'init') {
    const config = readConfig();
    if (config.memory?.repo) delete config.memory.repo;
    if (config.memory?.localPath) delete config.memory.localPath;
    writeConfig(config);
    const res = await ensureMemoryRepo();
    console.log(JSON.stringify(failIfError(res), null, 2));
  } else if (cmd === 'repo') {
    const config = readConfig();
    console.log(JSON.stringify({ repo: getMemoryRepo(config), localPath: getMemoryLocalPath(config) }, null, 2));
  } else {
    console.error(`unknown command ${cmd}`); process.exit(1);
  }
}