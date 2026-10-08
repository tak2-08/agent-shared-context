#!/usr/bin/env node
// Regression suite: real CLI processes in an isolated initialized project.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const tools = fileURLToPath(new URL('../tools/', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'ac-regressions-'));
function run(tool, args = []) {
  return spawnSync(process.execPath, [join(tools, tool), ...args],
    { cwd: dir, encoding: 'utf8', timeout: 15000 });
}
function expectSuccess(result, label) {
  assert.equal(result.status, 0, label + ': ' + result.stderr + '\n' + result.stdout);
}
function cli(tool, ...args) {
  const result = run(tool, args);
  expectSuccess(result, tool + ' ' + args[0]);
  return result;
}

try {
  // Indexing outside an initialized project must not mutate package templates.
  const empty = mkdtempSync(join(tmpdir(), 'ac-uninitialized-'));
  try {
    const uninitialized = spawnSync(process.execPath, [join(tools, 'agent-context-index.mjs'), '--dry-run'],
      { cwd: empty, encoding: 'utf8', timeout: 15000 });
    assert.notEqual(uninitialized.status, 0, 'uninitialized indexer unexpectedly succeeded');
    assert.match(uninitialized.stderr, /not initialized/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }

  cli('agent-context-init.mjs', '--yes', '--project', 'regression');

  // Same day/title/agent must never overwrite a previously saved memory.
  const title = 'quoted "title"\nstatus: archived';
  const content = 'result "quoted"\npriority: 5 \\escaped';
  const save = ['--assign', '--save', '--title', title, '--content', content,
    '--type', 'note', '--feature', 'global', '--agent', 'system', '--refs', 'docs/a"b.md'];
  cli('agent-search-lite.mjs', ...save);
  cli('agent-search-lite.mjs', ...save);
  const noteDir = join(dir, 'agent-context/notes');
  const saved = readdirSync(noteDir).filter(name => name.endsWith('.md'));
  assert.equal(saved.length, 2, 'duplicate save replaced an existing note');
  const contents = saved.map(name => readFileSync(join(noteDir, name), 'utf8'));
  for (const body of contents) {
    assert.match(body, /^title: "quoted \\"title\\" status: archived"$/m);
    assert.match(body, /^summary: "result \\"quoted\\" priority: 5 \\\\escaped"$/m);
    assert.match(body, /^status: done$/m);
    assert.equal((body.match(/^id:/gm) || []).length, 1);
  }

  // Malformed agent and type must not escape the initialized context directory.
  let invalid = run('agent-search-lite.mjs', [...save, '--agent', '../../outside']);
  assert.notEqual(invalid.status, 0, 'traversal-looking agent accepted');
  invalid = run('agent-search-lite.mjs', [...save, '--type', '../../outside']);
  assert.notEqual(invalid.status, 0, 'traversal-looking type accepted');
  assert.equal(readdirSync(noteDir).filter(name => name.endsWith('.md')).length, 2);

  // Meeting IDs must not be accepted as filesystem paths.
  invalid = run('agent-meeting.mjs', ['minutes', '../../../../etc/passwd']);
  assert.notEqual(invalid.status, 0, 'path-traversal meeting ID accepted');

  // Only moderator can start; same-title meetings must produce independent notes.
  for (let i = 0; i < 2; i++) {
    const meeting = JSON.parse(cli('agent-meeting.mjs', 'create', '--title', 'Shared title',
      '--moderator', 'alice', '--participants', 'bob').stdout);
    const outsider = JSON.parse(cli('agent-meeting.mjs', 'start', meeting.id, 'bob').stdout);
    assert.equal(outsider.error, 'only moderator can start meeting');
    const started = JSON.parse(cli('agent-meeting.mjs', 'start', meeting.id, 'alice').stdout);
    assert.equal(started.started, true);
    cli('agent-meeting.mjs', 'end', meeting.id, 'alice');
  }
  assert.equal(readdirSync(noteDir).filter(name => name.includes('shared-title') && name.endsWith('.md')).length, 2);
  expectSuccess(run('agent-context-validate.mjs'), 'validate generated records');
  expectSuccess(run('agent-context-index.mjs', ['--check']), 'check index after writes');

  console.log('regressions: 2 collision-safe saves, escaped frontmatter, rejected traversal, moderator gate, 2 unique meeting notes, validation and index checks passed');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
