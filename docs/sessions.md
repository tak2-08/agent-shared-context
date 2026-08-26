<!-- Path: docs/sessions.md -->
# Sessions — Inter-Agent Session Coordination

> File-based session coordination for parallel agents working in separate worktrees/terminals — hand over findings without human copy-paste. Inspired by contemporary inter-agent messaging patterns (session discovery, direct messaging, per-session inbox, inbound policies), adapted to a **file-based** `agent-shared-context` that works on any OS, any provider, any model.

## Why

Parallel sessions need to share context: one finds a breaking change, another is building on it. Without a channel, you copy-paste between terminals. With a channel, the finder notifies the builder before the break lands.

Design is restrained — plain text only, permission-aware inbound, local file never traverses servers same-machine — which we keep file-based.

## Patterns studied

| Pattern | What was studied |
|---|---|
| Session discovery + direct messaging | `ListAgents` / `SendMessage` style: discover reachable agents, deliver plain text by name, `/list-agents` equivalent |
| Per-session inbox | per-session file inbox `sessions/inbox/<name>.jsonl` (file-based equivalent of OS socket), `CLAUDE_CODE_MESSAGING_SOCKET` style env |
| Inbound policies | `crossSessionInbound` `accept`/`hold`/`refuse` per session, `isolatePeerMachines` for cross-machine, hold = approval, refuse = drop |
| Delivery semantics | plain text only (no history/files), between tool calls if busy, new turn if idle, cannot approve permission, `/compact` as plain text |
| Rate & limits | rate-limited, identical dropped (5s window), max 50 inbox, hold max 100 |
| Cross-machine | via servers vs via `git push` of inbox files (file-based allows both) |

**Not copied**: No vendor binary, no session JSON, no OAuth helper. Only the **coordination pattern** (discovery, inbox, plain text, policies) was adapted file-based.

## File-based design vs pattern

| Pattern | File-based equivalent | Where |
|---|---|---|
| Discover reachable agents | `node tools/agent-sessions.mjs list` — own first, like `/list-agents` | `tools/agent-sessions.mjs: listAgents()` |
| Deliver plain text by name | `node tools/agent-sessions.mjs send <target> <msg>` | `tools/agent-sessions.mjs: sendMessage()` |
| Per-session inbox | `agent-context/sessions/inbox/<name>.jsonl` + `sessions/sessions.json` registry, `socket=file:...` | `sessions/sessions.json:8` |
| Plain text only | truncates >4000, prepends `[plain text]` if `/`, cannot approve permission | `sendMessage()` |
| Inbound `accept`/`hold`/`refuse` | `sessions/config.json` `crossSessionInbound` | `config.json:4` |
| Rate/dedup/max | `dedupWindowMs:5000` `maxPerSender:10/min` `maxInbox:50` `maxHeld:100` | `rateLimit` |
| Isolate cross-machine | `isolatePeerMachines` boolean, `target` contains `@` → held | `isolatePeerMachines` |
| Own name first | `listAgents()` returns `{ own: env.AGENT_SESSION || 'local', sessions: [...] }` | `listAgents()` |
| Cross-machine | `git push` of inbox files would traverse git remote | — |
| No exclusions | Works on any OS/provider/model | — |

## File-based primitives

```bash
node tools/agent-sessions.mjs list
# → { own: "local", sessions: [{ name: "my-session", inbox: "sessions/inbox/my-session.jsonl" }] }

node tools/agent-sessions.mjs register my-session
# → binds file inbox, creates sessions/inbox/my-session.jsonl

node tools/agent-sessions.mjs send my-session "API changed — plain text only" --from other-session
# → { delivered: true, via: "file-inbox" }
# If inbound=hold → { held: true } / inbound=refuse → { dropped: true }

node tools/agent-sessions.mjs inbox my-session
# → [{ from: "other-session", content: "...", timestamp: "..." }]

node tools/agent-sessions.mjs wait my-session --timeout 30000
# → { mention: {...}, snapshot: {...} } or { waiting: true }

node tools/agent-sessions.mjs config
# → { crossSessionInbound: "accept", isolatePeerMachines: false }
```

- Same-machine file inbox never traverses servers. Cross-machine would traverse `git` remote.
- Plain text only, cannot approve permission, `/compact` as plain text.
- `wait` semantics: file poll every 500ms, surfaces at next step boundary (passive) vs blocking (costs turn).

## Session persistence (file-based)

Our registry mirrors contemporary patterns:

```ts
// File-based registry (inspired by session persistence patterns)
const sessions = { name, id, started_at, pid, inbox, socket, crossSessionInbound };
```

`register` binds, `list` discovers, `send` delivers — like `SessionStart` hook → `registerSession(name)`.

## Verification (file-based)

```bash
node tools/agent-sessions.mjs register test-session
node tools/agent-sessions.mjs list
node tools/agent-sessions.mjs send test-session "hello from other" --from other
node tools/agent-sessions.mjs inbox test-session
cat agent-context/sessions/inbox/test-session.jsonl
cat agent-context/sessions/sessions.json
```

Works on macOS/Linux/Windows, any provider.

## 동시 쓰기 충돌 전략 (Issue #3 관찰 반영)

여러 에이전트가 같은 저장소에 쓸 때의 규칙:

| 대상 | 전략 |
|---|---|
| `sessions/inbox/<name>.jsonl` | 수신자별 **파일 분리**라 충돌 없음. 각 세션은 자기 inbox만 append |
| `radio/threads/<name>.json` | 스레드별 파일 분리 + append 지향. 동시 append는 git merge가 라인 단위 해소 |
| `agent-context/*.md` | **1 PR = 1 파일** 원칙 유지. 서로 다른 파일이면 충돌 없음 |
| `index.json` | 파생물 — 충돌 시 어느 쪽이든 버리고 `node tools/agent-context-index.mjs` 재생성이 정답. 수동 merge 금지 |
| `sessions/handoff/*.md` | 세션별 파일 분리 (`<date>--<session>.md`) |

요약: **live 파일은 경로 분리로 회피, persistent md는 1 PR = 1 파일, index.json은 재생성으로 처리.** 실시간 기능과 PR 규칙의 상충은 "live는 커밋하지 않고 로컬 inbox에서 소비, 지식화할 가치가 있는 것만 entry→PR" 순서로 풀린다 (`docs/session-continuity.md` 참조).
