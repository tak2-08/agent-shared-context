#!/usr/bin/env node
// Path: tools/agent-sessions.mjs
// Inspired by contemporary inter-agent session coordination patterns (session discovery, direct messaging, per-session inbox, inbound policies)
// File-based equivalent of per-session inbox + ListAgents/SendMessage concepts
// - Same-machine: per-session file inbox (sessions/inbox/<name>.jsonl) instead of Unix socket, never traverses servers
// - Cross-machine: file inbox + git push traverses git remote (like Anthropic servers for Remote Control)
// - Plain text only, no history/files, between tool calls delivery, idle → new turn
// - Inbound: crossSessionInbound accept/hold/refuse, isolatePeerMachines, rateLimit, dedup, max 50/100
// Usage: node tools/agent-sessions.mjs <command> [args]
//   list                    — ListAgents equivalent
//   send <target> <msg> [--mention @agent]  — SendMessage
//   inbox <session>         — read inbox
//   register <name>         — register current session
//   wait <session> [--timeout 30000] — wait_for_mention (poll file)

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

function resolveConfig() {
  const candidates = [
    new URL('../agent-context.config.json', import.meta.url).pathname,
    new URL('../agent-context/agent-context.config.json', import.meta.url).pathname,
  ];
  for (const p of candidates) if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  return { contextRoot: 'agent-context', live: { sessions: {} } };
}
const CONFIG = resolveConfig();
const ROOT = new URL(`../${CONFIG.contextRoot || 'agent-context'}`, import.meta.url).pathname;
const SESSIONS_PATH = join(ROOT, 'sessions/sessions.json');
const INBOX_DIR = join(ROOT, 'sessions/inbox');
const SESSIONS_CONFIG_PATH = join(ROOT, 'sessions/config.json');

function ensureDirs() {
  mkdirSync(INBOX_DIR, { recursive: true });
  mkdirSync(dirname(SESSIONS_PATH), { recursive: true });
}
ensureDirs();

function readSessions() {
  try { return JSON.parse(readFileSync(SESSIONS_PATH, 'utf8')).sessions || []; } catch { return []; }
}
function writeSessions(sessions) {
  const data = { version: 1, _path: `${CONFIG.contextRoot || 'agent-context'}/sessions/sessions.json`, description: "Live session registry", generated_at: new Date().toISOString(), sessions };
  writeFileSync(SESSIONS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
function readSessionsConfig() {
  try { return JSON.parse(readFileSync(SESSIONS_CONFIG_PATH, 'utf8')); } catch { return { crossSessionInbound: 'accept', isolatePeerMachines: false, rateLimit: { maxPerSender: 10, dedupWindowMs: 5000, maxInbox: 50 } }; }
}

export function listAgents() {
  const sessions = readSessions();
  const cfg = readSessionsConfig();
  // Like Claude's /list-agents: first line is own session, rows below are reachable
  // For file-based, own session is process.env.AGENT_SESSION || 'local'
  const own = process.env.AGENT_SESSION || process.env.CLAUDE_CODE_SESSION_ID || 'local';
  return { own, sessions, config: { crossSessionInbound: cfg.crossSessionInbound, isolatePeerMachines: cfg.isolatePeerMachines }, note: "Same-machine file inbox, never traverses servers; cross-machine via git would traverse remote like Anthropic servers" };
}

export function registerSession(name, opts = {}) {
  const sessions = readSessions();
  if (sessions.find(s => s.name === name)) return { already: true, name };
  const entry = {
    name,
    id: opts.id || `${name}-${Date.now().toString(36)}`,
    started_at: new Date().toISOString(),
    pid: process.pid,
    inbox: `sessions/inbox/${name}.jsonl`,
    socket: `CLAUDE_CODE_MESSAGING_SOCKET=file:${INBOX_DIR}/${name}.jsonl`, // file-based equivalent of Unix socket
    platform: process.platform,
    crossSessionInbound: opts.inbound || readSessionsConfig().crossSessionInbound || 'accept',
  };
  sessions.push(entry);
  writeSessions(sessions);
  // create inbox file
  const inboxPath = join(INBOX_DIR, `${name}.jsonl`);
  if (!existsSync(inboxPath)) writeFileSync(inboxPath, '', 'utf8');
  return entry;
}

export function sendMessage(target, content, opts = {}) {
  // Like Claude's SendMessage: plain text only, never history/files
  if (typeof content !== 'string') content = String(content);
  if (content.length > 4000) content = content.slice(0, 4000) + '...[truncated]';
  // plainTextOnly: strip any slash command that would execute, like /compact
  if (content.trim().startsWith('/')) content = '[plain text] ' + content;
  const sessions = readSessions();
  const targetEntry = sessions.find(s => s.name === target);
  if (!targetEntry) {
    // In Claude, ListAgents must be called first to discover, SendMessage requires known name
    return { error: `unknown target '${target}'. Use list to discover.`, hint: "Run node tools/agent-sessions.mjs list to see reachable sessions (like /list-agents)" };
  }
  const cfg = readSessionsConfig();
  // isolatePeerMachines: require approval before message leaves machine (here, before writing to inbox if target is considered remote)
  // For file-based, remote = name containing '@' or cfg.isolatePeerMachines true and target not in local sessions
  if (cfg.isolatePeerMachines && target.includes('@')) {
    return { held: true, reason: "isolatePeerMachines=true — requires approval before cross-machine", target, content: content.slice(0, 80) + '...' };
  }
  // inbound policy of target
  const inbound = targetEntry.crossSessionInbound || cfg.crossSessionInbound || 'accept';
  if (inbound === 'refuse') {
    // Like Claude: still binds inbox but drops message without delivery
    return { dropped: true, reason: "target crossSessionInbound=refuse", target };
  }
  if (inbound === 'hold') {
    // hold for approval (5min expiry, max 100)
    const inboxPath = join(INBOX_DIR, `${target}.jsonl`);
    const heldPath = join(INBOX_DIR, `${target}.held.jsonl`);
    appendFileSync(heldPath, JSON.stringify({ from: opts.from || process.env.AGENT_SESSION || 'local', to: target, content, timestamp: new Date().toISOString(), status: 'held', expiry: Date.now() + 5*60*1000 }) + '\n', 'utf8');
    // cap held at 100
    try {
      const lines = readFileSync(heldPath, 'utf8').trim().split('\n').filter(Boolean);
      if (lines.length > 100) {
        const trimmed = lines.slice(-100).join('\n') + '\n';
        writeFileSync(heldPath, trimmed, 'utf8');
      }
    } catch {}
    return { held: true, target, reason: "target crossSessionInbound=hold — awaiting approval (5min expiry, max 100)" };
  }
  // rate limiting & dedup (like Claude: rate-limited, identical dropped, max 50 inbox)
  const inboxPath = join(INBOX_DIR, `${target}.jsonl`);
  try {
    const existing = existsSync(inboxPath) ? readFileSync(inboxPath, 'utf8').trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
    const now = Date.now();
    const dedupWindow = cfg.rateLimit?.dedupWindowMs || 5000;
    const identical = existing.find(m => m.content === content && (now - new Date(m.timestamp).getTime()) < dedupWindow);
    if (identical) return { dropped: true, reason: "identical message dedup (5s window)", target };
    const recentFromSender = existing.filter(m => m.from === (opts.from || 'local') && (now - new Date(m.timestamp).getTime()) < 60*1000).length;
    if (recentFromSender >= (cfg.rateLimit?.maxPerSender || 10)) return { dropped: true, reason: "rate-limited (10/min per sender)", target };
    if (existing.length >= (cfg.rateLimit?.maxInbox || 50)) {
      // drop oldest, keep 50
      const trimmed = existing.slice(-49);
      writeFileSync(inboxPath, trimmed.map(m => JSON.stringify(m)).join('\n') + (trimmed.length ? '\n' : ''), 'utf8');
    }
  } catch {}
  const msg = {
    from: opts.from || process.env.AGENT_SESSION || process.env.CLAUDE_CODE_SESSION_ID || 'local',
    to: target,
    content,
    mentions: opts.mentions || [],
    thread: opts.thread || null,
    timestamp: new Date().toISOString(),
    via: "file-inbox (same-machine socket equivalent, never traverses servers)",
  };
  appendFileSync(inboxPath, JSON.stringify(msg) + '\n', 'utf8');
  // Like Claude: message delivered between tool calls, or starts new turn if idle; plain text only; cannot approve permission, cannot change CLAUDE.md
  return { delivered: true, target, via: msg.via, note: "plain text only, cannot approve permission, cannot change config, /compact as plain text" };
}

export function readInbox(session) {
  const inboxPath = join(INBOX_DIR, `${session}.jsonl`);
  if (!existsSync(inboxPath)) return [];
  try {
    const content = readFileSync(inboxPath, 'utf8').trim();
    if (!content) return [];
    return content.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } });
  } catch { return []; }
}

export function waitForMention(session, timeout = 30000) {
  // Like AgentRadio wait_for_mention / Claude wait: blocks until mention arrives, returns with full thread snapshot
  // File-based poll every 500ms until timeout
  const start = Date.now();
  const poll = () => {
    const inbox = readInbox(session);
    const mentions = inbox.filter(m => (m.mentions || []).includes(session) || m.to === session);
    if (mentions.length) {
      // Return most recent mention + full snapshot (like AgentRadio's full thread snapshot so no second read needed)
      const threads = readThreadsSnapshot();
      return { mention: mentions[mentions.length - 1], snapshot: threads, all: mentions };
    }
    if (Date.now() - start >= timeout) return { timeout: true, after: timeout };
    return null;
  };
  // For file-based, we do single poll and return; caller can loop if needed (background task would poll)
  const result = poll();
  if (result) return result;
  return { waiting: true, note: "file-based: poll inbox between tool calls, idle session would start new turn on mention (like Claude)" };
}

function readThreadsSnapshot() {
  const threadsDir = join(ROOT, 'radio/threads');
  if (!existsSync(threadsDir)) return {};
  const out = {};
  for (const f of readdirSync(threadsDir)) {
    if (f.endsWith('.json')) {
      try { out[f.replace('.json','')] = JSON.parse(readFileSync(join(threadsDir, f), 'utf8')); } catch {}
    }
  }
  return out;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(`Usage: node tools/agent-sessions.mjs <command> [args]
Commands (Claude cross-session reverse-engineered, file-based):
  list                              ListAgents equivalent (own + reachable)
  register <name>                   register session (bind file inbox like Unix socket)
  send <target> <msg> [--from NAME] SendMessage plain text (respects inbound, dedup, rateLimit)
  inbox <session>                   read inbox file (between tool calls)
  wait <session> [--timeout 30000]  wait_for_mention (poll)
  config                            show crossSessionInbound / isolatePeerMachines
Examples:
  node tools/agent-sessions.mjs list
  node tools/agent-sessions.mjs register my-session
  node tools/agent-sessions.mjs send my-session "API changed, update calls" --from other-session
  node tools/agent-sessions.mjs inbox my-session
`);
    process.exit(0);
  }
  if (cmd === 'list') {
    console.log(JSON.stringify(listAgents(), null, 2));
  } else if (cmd === 'register') {
    const name = process.argv[3];
    if (!name) { console.error('register requires <name>'); process.exit(1); }
    console.log(JSON.stringify(registerSession(name), null, 2));
  } else if (cmd === 'send') {
    const target = process.argv[3];
    const msg = process.argv[4];
    if (!target || !msg) { console.error('send requires <target> <msg>'); process.exit(1); }
    const fromIdx = process.argv.indexOf('--from');
    const from = fromIdx !== -1 ? process.argv[fromIdx+1] : undefined;
    console.log(JSON.stringify(sendMessage(target, msg, { from }), null, 2));
  } else if (cmd === 'inbox') {
    const sess = process.argv[3];
    if (!sess) { console.error('inbox requires <session>'); process.exit(1); }
    console.log(JSON.stringify(readInbox(sess), null, 2));
  } else if (cmd === 'wait') {
    const sess = process.argv[3];
    if (!sess) { console.error('wait requires <session>'); process.exit(1); }
    const tIdx = process.argv.indexOf('--timeout');
    const timeout = tIdx !== -1 ? Number(process.argv[tIdx+1]) : 30000;
    console.log(JSON.stringify(waitForMention(sess, timeout), null, 2));
  } else if (cmd === 'config') {
    console.log(JSON.stringify(readSessionsConfig(), null, 2));
  } else {
    console.error(`unknown command ${cmd}`); process.exit(1);
  }
}
