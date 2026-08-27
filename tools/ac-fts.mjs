#!/usr/bin/env node
// Path: tools/ac-fts.mjs
// Optional SQLite FTS5 backend — 500+ entries에서 Grep(≈500ms) → FTS(≈20ms).
// zero-install 기본 철학 유지: Node ≥22.5의 내장 node:sqlite 를 사용하므로
// npm install 가 필요 없다. 미지원 환경에서는 정직하게 방법을 안내한다.
//
// Usage:
//   node tools/ac-fts.mjs build            # index.json → search.db (FTS5)
//   node tools/ac-fts.mjs query "jwt race" # FTS 질의
//   node tools/ac-fts.mjs status

import { existsSync, readFileSync, mkdirSync } from 'node:fs';
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
const INDEX_PATH = join(ROOT, 'index.json');
const PRIVATE = CONFIG.privateMirror || '.agent-context-runtime';
const DB_DIR = join(process.cwd(), PRIVATE);
const DB_PATH = join(DB_DIR, 'search.db');

let sqlite;
try {
  ({ DatabaseSync: sqlite } = await import('node:sqlite'));
} catch {
  console.error(JSON.stringify({
    error: 'node:sqlite unavailable',
    how_to: [
      'Node ≥22.5 필요 (내장 node:sqlite). 현재: ' + process.version,
      'Node ≥22.5로 실행: npx -p node@22 node --experimental-sqlite tools/ac-fts.mjs build',
      '또는 storage.backend=sqlite + better-sqlite3 설치 경로 사용 (선택)',
    ],
    fallback: 'backend=json 상태 유지 — Grep + index.json 으로 계속 동작 (기능 손실 없음)',
  }, null, 2));
  process.exit(1);
}

function loadEntries() {
  try { return JSON.parse(readFileSync(INDEX_PATH,'utf8')).entries || []; }
  catch { return []; }
}

function build() {
  mkdirSync(DB_DIR, { recursive:true });
  const db = new sqlite.DatabaseSync(DB_PATH);
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS ctx USING fts5(id UNINDEXED, path UNINDEXED, title, summary, tags, feature);`);
  db.exec(`DELETE FROM ctx;`);
  const ins = db.prepare(`INSERT INTO ctx (id, path, title, summary, tags, feature) VALUES (?, ?, ?, ?, ?, ?)`);
  let n = 0;
  for (const e of loadEntries()) {
    ins.run(e.id, e.path, e.title, e.summary||'', (e.tags||[]).join(' '), e.feature||'global');
    n++;
  }
  db.close();
  console.log(JSON.stringify({ built: true, db: `${PRIVATE}/search.db`, entries: n }, null, 2));
}

function query(q, limit = 10) {
  if (!existsSync(DB_PATH)) { console.error('search.db 없음 — 먼저 build'); process.exit(1); }
  const db = new sqlite.DatabaseSync(DB_PATH);
  const safe = q.replace(/["'*]/g, ' ').trim();
  const rows = db.prepare(`SELECT id, path, title, snippet(ctx,2,'[',']','…',12) AS snip FROM ctx WHERE ctx MATCH ? LIMIT ?`).all(safe, limit);
  db.close();
  console.log(JSON.stringify({ query: q, hits: rows.length, rows }, null, 2));
}

function status() {
  console.log(JSON.stringify({
    db_exists: existsSync(DB_PATH), db: DB_PATH,
    entries_in_index: loadEntries().length,
    recommendation: loadEntries().length >= 300 ? 'FTS 전환 권장 (Grep 체감 저하 구간)' : '현재 Grep으로 충분 — 전환 임계 300+',
  }, null, 2));
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'build') build();
else if (cmd === 'query') query(rest.join(' ') || '');
else if (cmd === 'status') status();
else { console.log('Usage: node tools/ac-fts.mjs build|query "..." | status'); process.exit(cmd ? 1 : 0); }
