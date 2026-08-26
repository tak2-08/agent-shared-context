#!/usr/bin/env node
// Path: tools/agent-handoff.mjs
// Session continuity — replaces lossy compaction with structured handoff bundles.
// Goal: a new session restores prior memory in ~500-800 tokens with near-zero loss,
// works without subagents (single Bash call, main agent runs it directly),
// and has zero-install fallbacks (pure Read/Grep recipes documented).
//
// Commands:
//   save  --session NAME --task "..." [--done "a;b;c"] [--next "..."] [--findings id1,id2]
//   load  [file]            — print resume brief (default: latest handoff)
//   list                    — list handoffs
//   current                 — print agent-context/CURRENT.md pointer content

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function resolveConfig() {
  const cands = [
    new URL('../agent-context.config.json', import.meta.url).pathname,
    new URL('../agent-context/agent-context.config.json', import.meta.url).pathname,
  ];
  for (const p of cands) if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  return { contextRoot: 'agent-context' };
}
const CONFIG = resolveConfig();
const ROOT = new URL(`../${CONFIG.contextRoot || 'agent-context'}`, import.meta.url).pathname;
const HANDOFF_DIR = join(ROOT, 'sessions/handoff');
const CURRENT_PATH = join(ROOT, 'CURRENT.md');
const INDEX_PATH = join(ROOT, 'index.json');

function ensureDirs() { mkdirSync(HANDOFF_DIR, { recursive: true }); }

function parseArgs() {
  const a = process.argv.slice(2);
  const out = { cmd: a[0], session: null, task: null, done: null, next: null, findings: null, file: null, json: false };
  for (let i = 1; i < a.length; i++) {
    if (a[i] === '--session') out.session = a[++i];
    else if (a[i] === '--task') out.task = a[++i];
    else if (a[i] === '--done') out.done = a[++i];
    else if (a[i] === '--next') out.next = a[++i];
    else if (a[i] === '--findings') out.findings = a[++i];
    else if (a[i] === '--json') out.json = true;
    else if (!a[i].startsWith('--')) out.file = a[i];
  }
  return out;
}

function readIndex() {
  try { return JSON.parse(readFileSync(INDEX_PATH, 'utf8')); } catch { return { entries: [] }; }
}

function recentEntries(n = 5) {
  const idx = readIndex();
  return (idx.entries || []).slice(0, n).map(e => ({
    id: e.id, title: e.title, level: e.level || null, path: e.path, estTokens: Math.ceil((e.chars || 200) / 4)
  }));
}

function save(args) {
  ensureDirs();
  if (!args.session || !args.task) {
    console.error('save requires --session NAME --task "..."');
    process.exit(1);
  }
  const date = new Date().toISOString().slice(0, 10);
  const fname = `${date}--${args.session}.md`;
  const path = join(HANDOFF_DIR, fname);
  const recent = recentEntries(5);
  const doneItems = args.done ? args.done.split(';').map(s => s.trim()).filter(Boolean) : [];
  const md = `<!-- Path: ${CONFIG.contextRoot || 'agent-context'}/sessions/handoff/${fname} -->
---
id: handoff-${date.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 10)}
type: handoff
level: diary
title: "Session handoff — ${args.session}"
tags: [handoff, session]
feature: global
scope: global
agent: system
created: ${new Date().toISOString()}
updated: ${new Date().toISOString()}
status: done
priority: 5
summary: "${args.task.slice(0, 120)}"
---

# Session Handoff — ${args.session}

## Task (goal)
${args.task}

## Done
${doneItems.length ? doneItems.map(d => `- ${d}`).join('\n') : '- (recorded in agent-context entries below)'}

## Key context pointers (read on demand, not now)
${recent.map(r => `- [${r.level || 'auto'}] ${r.title} → \`${r.path}\` (~${r.estTokens}tok)`).join('\n')}

## Next steps
${args.next ? args.next.split(';').map(s => `- ${s.trim()}`).join('\n') : '- Continue from index.json top priority'}

## Resume recipe (new session, ~600 tok total)
1. Read \`CURRENT.md\` (~50 tok) — this pointer
2. Read \`agent-context/index.json\` entries[].top (~300 tok) — full map
3. Run \`node tools/agent-search-lite.mjs "<your query>"\` — hierarchical, 0 LLM
4. Read only the 1-2 md files the search returns

> Compaction avoided: everything durable was saved as entries during work.
> This handoff is a pointer bundle, not a lossy summary.
`;
  writeFileSync(path, md, 'utf8');

  // Update CURRENT.md pointer
  const current = `<!-- Path: ${CONFIG.contextRoot || 'agent-context'}/CURRENT.md -->
# CURRENT — read me first (~50 tok)

- **Latest handoff**: \`sessions/handoff/${fname}\`
- **Task**: ${args.task.slice(0, 100)}
- **Next**: ${(args.next || 'continue from index.json').split(';')[0].trim().slice(0, 100)}
- **Resume recipe**: Read this → \`index.json\` → \`node tools/agent-search-lite.mjs "<query>"\` → read 1-2 md
- **Updated**: ${new Date().toISOString()}
`;
  writeFileSync(CURRENT_PATH, current, 'utf8');

  const chars = md.length;
  return {
    saved: true, path: `sessions/handoff/${fname}`, currentPointer: 'CURRENT.md',
    tokens: Math.ceil(chars / 4), resumeRecipeTokens: '~600',
    note: 'structured pointers, no lossy summary — details live in agent-context entries'
  };
}

function latestHandoff() {
  ensureDirs();
  const files = readdirSync(HANDOFF_DIR).filter(f => f.endsWith('.md')).sort().reverse();
  return files[0] ? join(HANDOFF_DIR, files[0]) : null;
}

function load(args) {
  let path = args.file ? join(HANDOFF_DIR, args.file) : latestHandoff();
  if (!path || !existsSync(path)) {
    // fallback to CURRENT.md pointer
    if (existsSync(CURRENT_PATH)) {
      const cur = readFileSync(CURRENT_PATH, 'utf8');
      return { source: 'CURRENT.md', tokens: Math.ceil(cur.length / 4), content: cur };
    }
    return { error: 'no handoff found; run save first' };
  }
  const src = readFileSync(path, 'utf8');
  const body = src.replace(/^---[\s\S]*?---\s*\n/, '');
  return {
    source: path.split('/').pop(),
    tokens: Math.ceil(body.length / 4),
    content: body,
    note: 'pointers only — read linked entries on demand via search-lite'
  };
}

function list() {
  ensureDirs();
  return readdirSync(HANDOFF_DIR).filter(f => f.endsWith('.md')).sort().reverse()
    .map(f => ({ file: f, tokens: Math.ceil(readFileSync(join(HANDOFF_DIR, f), 'utf8').length / 4) }));
}

const ARGS = parseArgs();
if (!ARGS.cmd || ARGS.cmd === '--help' || ARGS.cmd === '-h') {
  console.log(`Usage: node tools/agent-handoff.mjs <command> [args]
Session continuity — replace lossy compaction with structured handoff.

  save --session NAME --task "..." [--done "a;b;c"] [--next "..."]
       Creates sessions/handoff/<date>--<name>.md + updates CURRENT.md pointer.
       New sessions then restore in ~600 tokens instead of re-reading history
       or relying on compaction summaries.

  load [file]   Print resume brief (default: latest handoff, fallback CURRENT.md)
  list          List handoffs with token estimates
  current       Show CURRENT.md pointer

No subagent needed — single Bash call, main agent runs it directly.
Zero install beyond Node ≥18.`);
  process.exit(0);
}
if (ARGS.cmd === 'save') console.log(JSON.stringify(save(ARGS), null, 2));
else if (ARGS.cmd === 'load') console.log(JSON.stringify(load(ARGS), null, 2));
else if (ARGS.cmd === 'list') console.log(JSON.stringify(list(), null, 2));
else if (ARGS.cmd === 'current') {
  if (existsSync(CURRENT_PATH)) console.log(readFileSync(CURRENT_PATH, 'utf8'));
  else console.log('no CURRENT.md yet — run save');
}
else { console.error(`unknown command ${ARGS.cmd}`); process.exit(1); }
