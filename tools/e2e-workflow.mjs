#!/usr/bin/env node
// Path: tools/e2e-workflow.mjs
// End-to-end workflow test: init → write(ac) → validate → search → handoff
// Claude 외부 리뷰 권고 반영 — "도구 간 조합" 통합 결함 방지 게이트.
// Run: node tools/e2e-workflow.mjs   (temp dir에서 실제 시나리오 수행, 실패 시 exit 1)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';

const TOOLS = new URL('.', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'ac-e2e-'));
let failures = 0;
function step(name, fn) {
  const r = fn();
  if (r === false) { console.error(`FAIL ${name}`); failures++; }
  else console.log(`ok   ${name}`);
}
function ac(...a) {
  return spawnSync(process.execPath, [join(TOOLS, 'ac.mjs'), ...a], { cwd: dir, encoding: 'utf8' });
}

step('init scaffolds into temp project', () => {
  const r = spawnSync(process.execPath, [join(TOOLS, 'agent-context-init.mjs'), '--yes', '--project', 'e2e'], { cwd: dir, encoding: 'utf8' });
  return r.status === 0 && existsSync(join(dir, 'agent-context.config.json'));
});

step('write: ac issue creates entry with fluid type', () => {
  const r = ac('issue', '--title', 'login 500 on refresh', '--feature', 'auth', '--summary', 'refresh 시 500');
  return r.status === 0 && existsSync(join(dir, 'agent-context/bugs')) &&
    readdirSync(join(dir, "agent-context/bugs")).some(f => f.endsWith(".md"));
});

step('validate passes on fluid type (typesFluid)', () => {
  const r = spawnSync(process.execPath, [join(TOOLS, 'agent-context-validate.mjs')], { cwd: dir, encoding: 'utf8' });
  return r.status === 0;
});

step('search finds the issue (cross-agent recall)', () => {
  const r = spawnSync(process.execPath, [join(TOOLS, 'agent-search-lite.mjs'), 'login 500', '--json'], { cwd: dir, encoding: 'utf8' });
  try { const j = JSON.parse(r.stdout); return j.hit === true; } catch { return false; }
});

step('handoff save + load roundtrip', () => {
  const s = ac('export', '--session', 'agentA', '--task', 'fix login 500', '--next', 'verify');
  if (s.status !== 0) return false;
  const l = spawnSync(process.execPath, [join(TOOLS, 'ac.mjs'), 'import'], { cwd: dir, encoding: 'utf8' });
  return l.status === 0 && l.stdout.includes('Session Handoff');
});

step('CURRENT.md pointer exists for next session', () => existsSync(join(dir, 'agent-context/CURRENT.md')));

// cleanup
try { rmSync(dir, { recursive: true, force: true }); } catch {}
if (failures) { console.error(`\ne2e: ${failures} failure(s)`); process.exit(1); }
console.log('\ne2e: all steps passed');


