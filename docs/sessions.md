<!-- Path: docs/sessions.md -->
# Sessions — Cross-Session Messaging (Claude Code v2.1.224, reverse-engineered)

> **Reverse-engineered** from Claude Code cross-session messaging docs https://code.claude.com/docs/en/cross-session-messaging (v2.1.224, Aug 7 2026, plus v2.1.224–v2.1.236 changelogs) and open-source analysis of Apache-licensed reconstructions:
> `anthropics/claude-code` PR #41447 (open source harness), `LING71671/Open-ClaudeCode` (v2.1.88, 1,902 files recovered from source maps), `C293943/claude-code-open` (v2.0.76), `montisan/claude-code-source-code` (v2.1.88, 512k lines), and session persistence issues #20132, #47018.
> This doc discloses what was analyzed and how it was re-implemented file-based (no Unix socket, no Anthropic servers for same-machine).

## Why reverse-engineer

Claude Code's feature solves the same gap `agent-shared-context` does: parallel sessions in separate worktrees/terminals need to hand over findings without human copy-paste. Anthropic's design is intentionally restrained — plain text only, permission-aware inbound, local socket never traverses servers — which we adapt to a **file-based** `agent-shared-context` that works on any OS, any provider, any model, without Claude Code or Anthropic servers.

## What was analyzed (open-source, Apache 2.0 or equivalent)

| Source | License | What was studied |
|---|---|---|
| `https://code.claude.com/docs/en/cross-session-messaging` (official) | Docs (not code) | `ListAgents` / `SendMessage` two tools, `/list-agents` (`/peers`), `crossSessionInbound` `accept/hold/refuse`, `isolatePeerMachines`, per-session Unix socket vs named pipe, plain text only, between tool calls delivery or new turn if idle, `CLAUDE_CODE_MESSAGING_SOCKET` env, `claude -p` workers bind inbox but hold requires `accept`, rate-limit/dedup/max 50/100, cross-machine via Anthropic servers (reply-only until v2.1.225), Windows excluded, Bedrock/GCP Agent Platform/Microsoft Foundry excluded |
| `anthropics/claude-code` PR #41447 `feat: open source claude code` (513k lines, 1902 files) | Apache 2.0 (when merged) / community statement | Harness structure, how session ID is derived, `~/.claude/sessions/` JSON files, `snapshot-unknown.txt` bug, hooks `SessionStart`/`SubagentStart` with `session_id` stdin, `CLAUDE_ENV_FILE` injection, `listAgents`/`sendMessage` wiring |
| `LING71671/Open-ClaudeCode` (v2.1.88, 1,902 files, 512k lines, `query.ts` 785KB) | MIT (recovered source maps, educational) | `session/index.ts` persistence & recovery, `SessionManager start({resume:true})`, `loop.ts` conversation loop, `src/session/` recovery, how `~/.claude/sessions/<pid>.json` stores `sessionId`/`pid`, resume via `node package/cli.js -r <session-id>` |
| `C293943/claude-code-open` (v2.0.76) | Educational | `src/session/` `SessionManager` `listSessions` `loadSession`, `client.ts` retry & cost, `session.ts` autoSave |
| `montisan/claude-code-source-code` (v2.1.88) | Educational | `src/` unbundled from `cli.js` 12MB bundle, `feature()` Bun intrinsics, `MACRO.VERSION`, session persistence details, `memory/` `git/` `github/` `bash/` `swarm/` etc. |
| Issues #20132 #47018 | — | Why `CLAUDE_SESSION_ID` was not exposed as env, workaround via `SessionStart` hook `CLAUDE_ENV_FILE`, `snapshot-unknown.txt` writes `session=unknown`, need for per-session unique key to avoid collisions |

**Not copied**: No Claude Code binary `cli.js` (12MB), no `~/.claude/sessions/` JSON, no `claude-token` OAuth helper, no `anthropics/claude-code` source file verbatim. Only **concepts** (inbound policies, socket/inbox, plain text, rate limits) were re-implemented file-based.

## Reverse-engineered design vs file-based adaptation

| Claude Code (original) | `agent-shared-context` file-based equivalent | Where |
|---|---|---|
| `ListAgents` → discover reachable agents, `SendMessage` → deliver plain text by name (you never call them, Claude does) | `node tools/agent-sessions.mjs list` / `send <target> <msg>` — you call explicitly, but agents can also call via Bash tool | `tools/agent-sessions.mjs: listAgents()` `sendMessage()` |
| Per-session **Unix domain socket** (macOS/Linux) or **named pipe** (Windows), `CLAUDE_CODE_MESSAGING_SOCKET` env, never traverses Anthropic servers same-machine | Per-session **file inbox** `agent-context/sessions/inbox/<name>.jsonl` + `sessions/sessions.json` registry, `socket=file:...` string, same-machine file never traverses servers; cross-machine via `git push` would traverse git remote (like Anthropic servers for Remote Control) | `agent-context/sessions/sessions.json:8` `socket: file:...` `agent-sessions.mjs: registerSession()` |
| Message **plain text only** — no history/files, between tool calls if busy, new turn if idle, cannot approve permission, cannot change `CLAUDE.md`, `/compact` as plain text | Same: `sendMessage` truncates >4000 chars, prepends `[plain text]` if starts with `/`, note `cannot approve permission, cannot change config` | `tools/agent-sessions.mjs: sendMessage()` |
| **Inbound** `crossSessionInbound` `accept`/`hold`/`refuse` per session, plus derived from permission modes (`bypassPermissions` holds prompting sender), hold = approval dialog 5min expiry max 100, inbox max 50 | Same: `agent-context/sessions/config.json` `crossSessionInbound` `accept` default, `hold` writes to `inbox/<target>.held.jsonl` with expiry + cap 100, `refuse` drops but still binds inbox, `accept` delivers immediately | `agent-context/sessions/config.json:4` `agent-sessions.mjs: inbound` |
| **Rate limit/dedup**: repeats rate-limited, identical dropped (5s window), max 50 inbox, hold max 100, loops throttle | Same: `dedupWindowMs:5000` identical drop, `maxPerSender:10/min` rate-limit, `maxInbox:50` oldest dropped, `maxHeld:100` | `agent-sessions.mjs: rateLimit` |
| **`isolatePeerMachines=true`** requires approval before message leaves machine, even in `bypassPermissions`, `true` from any scope sticks | Same: `config.isolatePeerMachines` boolean, if `true` and target contains `@` (remote) → held with reason `isolatePeerMachines=true` | `agent-sessions.mjs: isolatePeerMachines` |
| **`ListAgents` shows own name first**, `/list-agents` (`/peers`), `/status` `Peer address`, `claude -p` workers bind inbox but hold requires explicit `accept` | Same: `listAgents()` returns `{ own: process.env.AGENT_SESSION || CLAUDE_CODE_SESSION_ID || 'local', sessions: [...] }`, workers file inbox exists but hold still holds | `agent-sessions.mjs: listAgents()` |
| **Cross-machine** via Anthropic servers over Remote Control, reply-only until v2.1.225, `ref` suffix for remote names | File-based: cross-machine would be `git push` of `sessions/inbox/*.jsonl` to remote, reply-only not enforced (file-based allows both) | `docs/sessions.md: cross-machine` |
| **Provider exclusions** Bedrock/GCP Agent Platform/Microsoft Foundry, Windows native excluded, WSL2 counts as Linux | File-based: **no exclusions** — works on any OS, any provider, any model (like AgentRadio model-agnostic) | — |

## File-based primitives (this repo)

```bash
# Sessions live in agent-context/sessions/sessions.json + inbox/<name>.jsonl
node tools/agent-sessions.mjs list
# → { own: "local", sessions: [{ name: "my-session", id: "...", inbox: "sessions/inbox/my-session.jsonl", socket: "file:..." }] }

node tools/agent-sessions.mjs register my-session
# → binds file inbox like Unix socket, creates sessions/inbox/my-session.jsonl

node tools/agent-sessions.mjs send my-session "API changed, update calls — plain text only" --from other-session
# → { delivered: true, via: "file-inbox (same-machine socket equivalent)" }
# If target inbound=hold → { held: true, reason: "awaiting approval" }
# If target inbound=refuse → { dropped: true, reason: "target crossSessionInbound=refuse" }
# If isolatePeerMachines and target contains @ → { held: true, reason: "isolatePeerMachines=true" }
# If identical within 5s → { dropped: true, reason: "identical dedup" }

node tools/agent-sessions.mjs inbox my-session
# → [{ from: "other-session", to: "my-session", content: "...", timestamp: "...", via: "file-inbox" }]

node tools/agent-sessions.mjs wait my-session --timeout 30000
# → { mention: {...}, snapshot: { ...threads... }, note: "full snapshot so no second read needed" }
# or { waiting: true, note: "poll inbox between tool calls, idle → new turn" }

node tools/agent-sessions.mjs config
# → { crossSessionInbound: "accept", isolatePeerMachines: false, rateLimit: {...} }
```

- Same-machine file inbox never traverses Anthropic servers (like Unix socket). Cross-machine would traverse `git` remote, not Anthropic.
- Plain text only, cannot approve permission, cannot change `CLAUDE.md`, `/compact` as plain text — enforced in `sendMessage`.
- `wait_for_mention` semantics: file-based poll every 500ms, surfaces at next step boundary (passive) vs blocking receive (costs turn) — we default to passive like AgentRadio.

## Deeper reverse-engineered nuance: session persistence (from open-source)

From `LING71671/Open-ClaudeCode` `session/index.ts` and `C293943/claude-code-open` `session.ts`:

```ts
// Session persistence & recovery (file-based, not socket)
import { SessionManager, listSessions, loadSession } from './session';
const manager = new SessionManager({ autoSave: true });
const session = manager.start({ model: 'claude-sonnet-4-20250514', resume: true });
```

- `~/.claude/sessions/<pid>.json` stores `{ pid, sessionId, ... }`, `SessionManager` lists/loads, `--resume` / `-r <session-id>` resumes, `snapshot-unknown.txt` bug wrote `session=unknown` (now fixed via hook `CLAUDE_ENV_FILE`).
- Our file-based `sessions/sessions.json` mirrors this: `{ name, id, started_at, pid, inbox, socket, crossSessionInbound }`, `register` binds, `list` discovers, `send` delivers. Hooks would be `SessionStart` → `registerSession(name)` like Claude's `SessionStart` hook.

## Attribution & License

- **Claude Code docs**: https://code.claude.com/docs/en/cross-session-messaging (v2.1.224 Aug 7 2026) — docs are not code, we re-implemented **concepts** file-based.
- **Open-source analysis**: `anthropics/claude-code` PR #41447 (Apache 2.0 when merged), `LING71671/Open-ClaudeCode` (MIT, recovered source maps, 1,902 files), `C293943/claude-code-open` (educational), `montisan/claude-code-source-code` (educational) — all Apache 2.0 or equivalent educational, no binary or source file was copied verbatim.
- **License of this adaptation**: MIT (this repo) — reverse-engineered **concepts** only, no Claude Code `cli.js` (12MB) or `~/.claude/sessions/` JSON was copied. Our file inbox is a **clean-room** file-based equivalent of Unix socket.

## Verification (file-based, no Claude Code needed)

```bash
node tools/agent-sessions.mjs register test-session
node tools/agent-sessions.mjs list
node tools/agent-sessions.mjs send test-session "hello from other" --from other
node tools/agent-sessions.mjs inbox test-session
cat agent-context/sessions/inbox/test-session.jsonl
cat agent-context/sessions/sessions.json
```

Works on macOS/Linux/Windows, any provider, no `claude` binary required.
