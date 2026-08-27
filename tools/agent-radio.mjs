#!/usr/bin/env node
// Path: tools/agent-radio.mjs
// Inspired by Coral-Protocol/AgentRadio (Apache 2.0, https://github.com/Coral-Protocol/AgentRadio)
// Paper: AgentRadio: Passive Awareness for Long-Horizon Multi-Agent Collaboration (arXiv:2607.28430)
// Referenced concepts (with attribution, Apache 2.0):
//   - Three primitives: create_thread(name, participants), send_message(thread, content, mentions), wait_for_mention(timeout)
//   - Five-phase protocol: P1 Explore → P2 Divide → P3 Execute → P4 Review → P5 Submit (assembler gates transitions)
//   - Passive awareness: wait_for_mention as background task (no turn stolen) vs foreground blocking receive (costs a turn)
//   - No harness modification: shell command in background, standalone message server + 3 thin scripts → here file-based threads
//   - No extra LLM calls: watcher is OS process, not agent step, only surfaced messages cost tokens
//   - Model-agnostic, clean ablation ladder B0→L1→L2→L3
// File-based equivalent: threads as JSON files, passive awareness via background poll of inbox file
// Usage: node tools/agent-radio.mjs <command> [args]
//   create-thread <name> <participants...>   — create_thread
//   send <thread> <content> [--mention @agent] — send_message
//   wait <agent> [--timeout 30000]          — wait_for_mention (background)
//   list-threads                            — list threads
//   read-thread <name>                      — read thread + snapshot

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

function resolveConfig() {
  const candidates = [
    new URL('../agent-context.config.json', import.meta.url).pathname,
    new URL('../agent-context/agent-context.config.json', import.meta.url).pathname,
  ];
  for (const p of candidates) if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  return { contextRoot: 'agent-context', live: { radio: {} } };
}
const CONFIG = resolveConfig();
// Issue #3 fix: cwd-first — operate on the user's project, fall back to script-relative only inside the source repo
const ROOT = (existsSync(join(process.cwd(), 'agent-context.config.json')) || existsSync(join(process.cwd(), CONFIG.contextRoot || 'agent-context')))
  ? join(process.cwd(), CONFIG.contextRoot || 'agent-context')
  : new URL(`../${CONFIG.contextRoot || 'agent-context'}`, import.meta.url).pathname;
const THREADS_DIR = join(ROOT, 'radio/threads');
const SESSIONS_INBOX_DIR = join(ROOT, 'sessions/inbox');

function ensureDirs() {
  mkdirSync(THREADS_DIR, { recursive: true });
  mkdirSync(SESSIONS_INBOX_DIR, { recursive: true });
}
ensureDirs();

// Issue #10 fix: thread names become filenames (radio/threads/<name>.json).
// Reject path separators / traversal / control chars up front — previously
// `create-thread "a/b"` crashed ENOENT.
function isValidName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 128
    && !/[\/\\\0]/.test(name) && !name.includes('..');
}
const INVALID_NAME_MSG = n => `invalid thread name '${n}' — must be 1-128 chars, no '/', '\\', '..' or control characters`;

// Issue #10 fix: validate mentions against sessions registry. Unknown mentions
// are almost certainly typos — the message would never wake anyone.
function validateMentions(mentions) {
  const sessionsPath = join(ROOT, 'sessions/sessions.json');
  if (!existsSync(sessionsPath)) return { valid: true }; // no registry → can't check
  try {
    const sessions = JSON.parse(readFileSync(sessionsPath, 'utf8')).sessions || [];
    const known = new Set(sessions.map(s => s.name));
    for (const m of mentions) if (!known.has(m)) return { valid: false, unknown: m, known: [...known] };
    return { valid: true };
  } catch { return { valid: true }; } // corrupt registry → don't block
}

export function createThread(name, participants = []) {
  // Like AgentRadio create_thread(name, participants) → returns identifier
  if (!isValidName(name)) return { error: INVALID_NAME_MSG(name) };
  const path = join(THREADS_DIR, `${name}.json`);
  if (existsSync(path)) return { already: true, name, path: `radio/threads/${name}.json` };
  const thread = {
    name,
    id: `${name}-${Date.now().toString(36)}`,
    participants,
    created_at: new Date().toISOString(),
    messages: [],
    phase: "P1-Explore",
    note: "Assembler gates every transition — phase ends only after explicit approval from every agent (like AgentRadio P1-P5)"
  };
  writeFileSync(path, JSON.stringify(thread, null, 2) + '\n', 'utf8');
  return { created: true, name, id: thread.id, participants, path: `radio/threads/${name}.json` };
}

export function sendMessage(thread, content, opts = {}) {
  // Like AgentRadio send_message(thread, content, mentions) → appends and returns immediately whether anyone listening
  // May @-mention specific agents, triggers passive awareness if watcher is background
  if (!isValidName(thread)) return { error: INVALID_NAME_MSG(thread) };
  const path = join(THREADS_DIR, `${thread}.json`);
  if (!existsSync(path)) return { error: `unknown thread '${thread}'. Use create-thread first.` };
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const mentions = opts.mentions || [];
  // Also handle @mentions in content like "@claude" or "@codex"
  const atMentions = [...content.matchAll(/@([a-z0-9_-]+)/gi)].map(m => m[1]);
  const allMentions = [...new Set([...mentions, ...atMentions])];
  // Issue #10 fix: validate mentions against sessions registry
  const mentionCheck = validateMentions(allMentions);
  if (!mentionCheck.valid) {
    return { error: `unknown mention '@${mentionCheck.unknown}' — not in sessions registry`, known: mentionCheck.known };
  }
  const msg = {
    from: opts.from || process.env.AGENT_SESSION || 'local',
    content,
    mentions: allMentions,
    timestamp: new Date().toISOString(),
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`
  };
  data.messages.push(msg);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  // Passive awareness: if background watcher, mention surfaces at next step boundary with no step cost
  // Here we simulate by also writing to each mentioned agent's inbox file (like Claude's per-session socket) so wait_for_mention can pick it up without extra LLM call
  for (const m of allMentions) {
    const inboxPath = join(SESSIONS_INBOX_DIR, `${m}.jsonl`);
    // Ensure inbox exists
    if (!existsSync(inboxPath)) writeFileSync(inboxPath, '', 'utf8');
    appendFileSync(inboxPath, JSON.stringify({ ...msg, thread, via: "radio → inbox (passive awareness, background task)" }) + '\n', 'utf8');
  }
  // No extra LLM calls: watcher is OS process, not agent step, only surfaced messages cost tokens (like AgentRadio)
  return { sent: true, thread, mentions: allMentions, id: msg.id, note: "background wait_for_mention surfaces at next step boundary, no turn stolen (vs foreground blocking receive which costs a turn)" };
}

export function waitForMention(agent, timeout = 30000) {
  // Like AgentRadio wait_for_mention(timeout) → blocks until mention arrives, returns with full snapshot of every thread
  // So caller never needs second read to reconstruct context
  // File-based: poll inbox file every 500ms, return full threads snapshot
  const inboxPath = join(SESSIONS_INBOX_DIR, `${agent}.jsonl`);
  if (!existsSync(inboxPath)) return { timeout: true, reason: `no inbox for ${agent}, register session or create mention` };
  const start = Date.now();
  const pollOnce = () => {
    try {
      const lines = readFileSync(inboxPath, 'utf8').trim().split('\n').filter(Boolean);
      if (!lines.length) return null;
      // Find last mention for this agent (either direct inbox or via radio)
      const inbox = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const mentions = inbox.filter(m => (m.mentions || []).includes(agent) || m.to === agent);
      if (mentions.length) {
        const snapshot = {};
        for (const f of readdirSync(THREADS_DIR)) {
          if (f.endsWith('.json')) {
            try { snapshot[f.replace('.json','')] = JSON.parse(readFileSync(join(THREADS_DIR, f), 'utf8')); } catch {}
          }
        }
        return { mention: mentions[mentions.length - 1], snapshot, allMentions: mentions, note: "full snapshot so no second read needed (AgentRadio)" };
      }
    } catch {}
    return null;
  };
  const immediate = pollOnce();
  if (immediate) return immediate;
  // For file-based, we don't truly block; we return waiting instruction for background task simulation
  // In real AgentRadio, wait_for_mention runs as background shell task, harness surfaces at step boundary
  return {
    waiting: true,
    agent,
    timeout,
    instruction: "Run as background task: while not timeout, poll inbox every 500ms; on mention, surface at next step boundary without costing a turn (passive awareness). Foreground alternative would be blocking receive costing a turn (L2).",
    background: "nohup node tools/agent-radio.mjs wait <agent> --timeout 30000 &  # or harness background task",
    noExtraLLMCalls: true,
    modelAgnostic: true
  };
}

export function listThreads() {
  if (!existsSync(THREADS_DIR)) return [];
  return readdirSync(THREADS_DIR).filter(f => f.endsWith('.json')).map(f => {
    try {
      const d = JSON.parse(readFileSync(join(THREADS_DIR, f), 'utf8'));
      return { name: d.name, id: d.id, participants: d.participants, messages: d.messages.length, phase: d.phase };
    } catch { return { name: f }; }
  });
}

export function readThread(name) {
  const path = join(THREADS_DIR, `${name}.json`);
  if (!existsSync(path)) return { error: `unknown thread ${name}` };
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function fivePhaseProtocol() {
  // Like AgentRadio five-phase protocol (assembler gates)
  return {
    P1_Explore: "every agent starts background watcher, independently explores repo, drafts sub-questions. Nothing sent.",
    P2_Divide: "assembler opens planning thread. Agents pool findings, negotiate partition, revise until every agent approves.",
    P3_Execute: "each agent works its sub-questions. Discovery triggers worklog post immediately (bears on teammate, contradicts plan, obstacle, dead end) — passive awareness lands immediately, teammate folds into task in flight (vs blocking receive where sharing disappears until P4)",
    P4_Review: "each agent broadcasts findings with evidence in own results thread. Reviewers post conflicts, thin evidence, unmentioned observations, can send sub-question back to P3.",
    P5_Submit: "assembler composes final answer from approved results, broadcasts draft for last approvals, submits.",
    note: "Four agents + division (L1) 39.5%, + negotiation blocking receive (L2) 51.6%, + passive awareness background wait_for_mention (L3 AgentRadio) 62.1% on Opus 4.6 (SWE-Atlas QnA 124 tasks) — paper arXiv:2607.28430. Same protocol, only wait_for_mention placement differs."
  };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  // Issue #10 fix: helper to print result and exit 1 on {error} — previously
  // unknown-thread/unknown-mention returned {error} with exit 0, invisible to CI.
  function print(res) {
    if (res && res.error) { console.error(JSON.stringify(res, null, 2)); process.exit(1); }
    console.log(JSON.stringify(res, null, 2));
  }
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(`Usage: node tools/agent-radio.mjs <command> [args]
Commands (AgentRadio passive awareness, Apache 2.0, file-based):
  create-thread <name> <participants...>   create_thread
  send <thread> <content> [--mention @agent]  send_message (may @-mention)
  wait <agent> [--timeout 30000]           wait_for_mention (background)
  list-threads                            list threads
  read-thread <name>                      read thread + messages
  protocol                                show five-phase protocol (P1-P5)
  help                                    this help
Attribution: Concepts from Coral-Protocol/AgentRadio (Apache 2.0) — three primitives, five-phase protocol, passive awareness background vs blocking receive, no harness modification, no extra LLM calls, model-agnostic, ablation B0→L3. See REFERENCES.md
Examples:
  node tools/agent-radio.mjs create-thread planning "claude,codex,opencode,system"
  node tools/agent-radio.mjs send planning "found JWT race, affects api" --mention @codex
  node tools/agent-radio.mjs wait codex --timeout 30000
  node tools/agent-radio.mjs list-threads
`);
    process.exit(0);
  }
  if (cmd === 'create-thread') {
    const name = process.argv[3];
    const participants = process.argv.slice(4);
    if (!name) { console.error('create-thread requires <name>'); process.exit(1); }
    print(createThread(name, participants));
  } else if (cmd === 'send') {
    const thread = process.argv[3];
    const content = process.argv[4];
    if (!thread || !content) { console.error('send requires <thread> <content>'); process.exit(1); }
    const mIdx = process.argv.indexOf('--mention');
    const mentions = mIdx !== -1 ? process.argv.slice(mIdx+1).filter(a => a.startsWith('@')).map(a => a.slice(1)) : [];
    const fromIdx = process.argv.indexOf('--from');
    const from = fromIdx !== -1 ? process.argv[fromIdx+1] : undefined;
    print(sendMessage(thread, content, { mentions, from }));
  } else if (cmd === 'wait') {
    const agent = process.argv[3];
    if (!agent) { console.error('wait requires <agent>'); process.exit(1); }
    const tIdx = process.argv.indexOf('--timeout');
    const timeout = tIdx !== -1 ? Number(process.argv[tIdx+1]) : 30000;
    print(waitForMention(agent, timeout));
  } else if (cmd === 'list-threads') {
    print(listThreads());
  } else if (cmd === 'read-thread') {
    const name = process.argv[3];
    if (!name) { console.error('read-thread requires <name>'); process.exit(1); }
    print(readThread(name));
  } else if (cmd === 'protocol') {
    print(fivePhaseProtocol());
  } else {
    console.error(`unknown command ${cmd}`); process.exit(1);
  }
}
