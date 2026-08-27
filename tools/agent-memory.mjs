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

// ── GitHub memory repo management ──────────────────────────────────────────────
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

async function ensureMemoryRepo() {
  const config = readConfig();
  let repo = getMemoryRepo(config);
  if (repo) return { repo, localPath: getMemoryLocalPath(config) };

  // No repo configured — try to auto-create via gh CLI
  console.log('🧠 메모리 저장소가 없습니다. GitHub에 개인 메모리 레포를 생성합니다...');
  
  const username = getGhUsername();
  if (!username) {
    return { error: 'GitHub CLI(gh) 인증 필요. `gh auth login` 실행 후 다시 시도하거나, 수동으로 레포를 생성해 config에 추가하세요.' };
  }

  const repoName = 'agent-shared-context-memory';
  const fullRepo = `${username}/${repoName}`;
  
  console.log(`   생성 중: ${fullRepo} (private)...`);
  const result = spawnSync('gh', ['repo', 'create', fullRepo, '--private', '--description', 'Personal agent-shared-context memory store'], { encoding: 'utf8' });
  
  if (result.status !== 0) {
    // Repo might already exist
    if (result.stderr?.includes('already exists') || result.stderr?.includes('name already exists')) {
      console.log(`   이미 존재함: ${fullRepo}`);
    } else {
      return { error: `레포 생성 실패: ${result.stderr || result.stdout}` };
    }
  } else {
    console.log(`   ✅ 생성 완료: https://github.com/${fullRepo}`);
  }

  // Clone to local cache
  const localPath = getMemoryLocalPath(config);
  const cloneResult = spawnSync('gh', ['repo', 'clone', fullRepo, localPath], { encoding: 'utf8' });
  if (cloneResult.status !== 0 && !cloneResult.stderr?.includes('already exists')) {
    // Try manual clone
    spawnSync('git', ['clone', `https://github.com/${fullRepo}.git`, localPath], { encoding: 'utf8' });
  }

  // Initialize MEMORY.md + daily if empty
  await initMemoryRepo(localPath);

  repo = setMemoryRepo(config, fullRepo);
  if (!config.memory.localPath) {
    config.memory.localPath = localPath;
    writeConfig(config);
  }
  return { repo, localPath };
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
  spawnSync('git', ['-C', localPath, 'pull', '--rebase'], { encoding: 'utf8', stdio: 'ignore' });
}

function pushMemory(localPath, message = 'chore: memory sync') {
  spawnSync('git', ['-C', localPath, 'add', '-A'], { encoding: 'utf8', stdio: 'ignore' });
  const status = spawnSync('git', ['-C', localPath, 'status', '--porcelain'], { encoding: 'utf8' });
  if (status.stdout.trim()) {
    spawnSync('git', ['-C', localPath, 'commit', '-m', message], { encoding: 'utf8', stdio: 'ignore' });
    spawnSync('git', ['-C', localPath, 'push'], { encoding: 'utf8', stdio: 'ignore' });
  }
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
  pushMemory(localPath, `chore: memory write ${path}`);
  return { repo, path: fullPath, written: true };
}

export async function memoryStatus() {
  const { repo, localPath, error } = await ensureMemoryRepo();
  if (error) return { error };
  pullMemory(localPath);
  
  const memSize = existsSync(join(localPath, 'MEMORY.md')) 
    ? readFileSync(join(localPath, 'MEMORY.md'), 'utf8').length : 0;
  const dailyCount = existsSync(join(localPath, 'daily'))
    ? readdirSync(join(localPath, 'daily')).filter(f => f.endsWith('.md')).length : 0;
  
  return { repo, localPath, memoryMdBytes: memSize, dailyFiles: dailyCount, lastSync: now() };
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
  
  if (cmd === 'search') {
    const q = args[1] || getFlag('--query');
    if (!q) { console.error('search requires query'); process.exit(1); }
    const res = await memorySearch(q, { maxResults: Number(getFlag('--max') || 10), maxDays: Number(getFlag('--days') || 30) });
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'get') {
    const path = args[1] || 'MEMORY.md';
    const res = await memoryGet(path, { from: Number(getFlag('--from') || 1), lines: Number(getFlag('--lines') || 80) });
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'write') {
    const path = args[1] || 'daily';
    const content = args.slice(2).join(' ') || getFlag('--content');
    if (!content) { console.error('write requires content'); process.exit(1); }
    const res = await memoryWrite(path, content, getFlag('--mode') || 'append');
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'status') {
    console.log(JSON.stringify(await memoryStatus(), null, 2));
  } else if (cmd === 'dream') {
    console.log(JSON.stringify(await memoryDream({ days: Number(getFlag('--days') || 7) }), null, 2));
  } else if (cmd === 'init') {
    const config = readConfig();
    if (config.memory?.repo) delete config.memory.repo;
    if (config.memory?.localPath) delete config.memory.localPath;
    writeConfig(config);
    console.log(JSON.stringify(await ensureMemoryRepo(), null, 2));
  } else if (cmd === 'repo') {
    const config = readConfig();
    console.log(JSON.stringify({ repo: getMemoryRepo(config), localPath: getMemoryLocalPath(config) }, null, 2));
  } else {
    console.error(`unknown command ${cmd}`); process.exit(1);
  }
}