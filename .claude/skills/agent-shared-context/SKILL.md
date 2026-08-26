---
name: agent-shared-context
description: "Inter-agent shared context DB — token-saving 3-layer (index→graph→md) + live radio/sessions. Use when you need to share context among Claude/Codex/OpenCode sessions, recall prior decisions/learnings/bugs, or coordinate live via passive awareness."
allowed-tools: "Read, Grep, Glob, Bash(node tools/agent-sessions.mjs *), Bash(node tools/agent-radio.mjs *), Bash(node tools/agent-context-index.mjs *), Bash(node tools/agent-context-validate.mjs)"
---

# agent-shared-context — Claude Code Skill

> **Purpose**: Let Claude sessions **share context via git** (persistent) and **via file inbox/radio** (live), with 82% token saving. Universal, no project-specific hardcoding.

## When to use

- You need to **recall prior decisions/learnings/bugs** before starting a task → `Read agent-context/index.json`
- You need to **hand over a finding** to another session mid-task → `node tools/agent-sessions.mjs send <target> <msg>` or `node tools/agent-radio.mjs send <thread> <msg> --mention @agent`
- You are **blocked** and another session has the answer → `node tools/agent-sessions.mjs wait <own-session>` or `node tools/agent-radio.mjs wait <own-agent>`
- You need to **coordinate 4 agents** on a long-horizon task → use five-phase protocol `node tools/agent-radio.mjs protocol`

## Quick start (3 steps, 82% cheaper)

```
1. Read agent-context/index.json          # L1 — 50 tok/entry, full summary
2. Read agent-context/graph.json + features.json  # L2 — depends_on/affects
3. Grep pattern="..." path="agent-context" then Read 1~2 md  # L3 — detail
```

**Never** `Glob + Read *.md 10` (~12k tokens). Always `index.json + Read 2` (~2.2k).

## File protocol

- **Persistent**: `agent-context/*.md` + `index.json`/`graph.json`/`features.json`/`schema.json` — git-tracked, `git pull` sync, `1 PR = 1 file`, `Read` then `Edit` (never `Write` overwrite), `diary/YYYY-MM-DD.md` append-only
- **Live sessions** (Claude reverse-engineered): `agent-context/sessions/sessions.json` registry + `sessions/inbox/<name>.jsonl` per-session file inbox (Unix socket equivalent, never traverses servers same-machine)
  - `node tools/agent-sessions.mjs register <name>` — bind inbox (like Claude's per-session socket, `CLAUDE_CODE_MESSAGING_SOCKET=file:...`)
  - `node tools/agent-sessions.mjs list` — `ListAgents` equivalent, own first
  - `node tools/agent-sessions.mjs send <target> <msg> --from <own>` — `SendMessage` plain text only, cannot approve permission, `/compact` as plain text, respects `crossSessionInbound` `accept/hold/refuse` + `isolatePeerMachines` + rate-limit/dedup/max 50/100
  - `node tools/agent-sessions.mjs inbox <session>` — read between tool calls, idle → new turn
  - `node tools/agent-sessions.mjs wait <session> --timeout 30000` — `wait_for_mention` with full snapshot
- **Live radio** (AgentRadio, Apache 2.0): `agent-context/radio/threads/<name>.json` + `sessions/inbox/` for passive awareness
  - `node tools/agent-radio.mjs create-thread <name> <participants...>` — `create_thread`
  - `node tools/agent-radio.mjs send <thread> <content> --mention @agent` — `send_message`, also writes to mentioned agent's inbox for passive awareness (no turn stolen vs blocking receive)
  - `node tools/agent-radio.mjs wait <agent> --timeout 30000` — `wait_for_mention` background, returns with full thread snapshot so no second read needed
  - `node tools/agent-radio.mjs protocol` — P1 Explore → P2 Divide → P3 Execute → P4 Review → P5 Submit (assembler gates)

## Five-phase protocol (for multi-agent, from AgentRadio)

- **P1 Explore**: every agent starts background watcher, drafts sub-questions, nothing sent
- **P2 Divide**: assembler opens planning thread, negotiate partition until every agent approves
- **P3 Execute**: each works sub-questions, discovery triggers worklog post immediately — passive awareness lands mid-flight
- **P4 Review**: broadcast findings with evidence, reviewers post conflicts, can send back to P3
- **P5 Submit**: assembler composes final answer, broadcasts draft for approvals, submits

## Frontmatter (10 required)

```yaml
id: learning-20260827-a1b2c3d4
type: learning  # note/memo/idea/learning/bug/decision/diary/code-history/todo
title: "≤80 chars"
tags: [auth, jwt]
feature: auth  # from agent-context.config.json features
agent: claude  # claude/codex/opencode/human/system
created: 2026-08-27T10:00:00+09:00
updated: 2026-08-27T10:00:00+09:00
status: done  # open/doing/done/archived/proposed/adopted/rejected/superseded
summary: "≤200 chars — index.json preview"
```

## Commands you should run

```bash
# Before task
Read agent-context/index.json
Read agent-context/graph.json
Grep pattern="keyword" path="agent-context" include="*.md"

# Live hand over (Claude)
node tools/agent-sessions.mjs register my-session
node tools/agent-sessions.mjs list
node tools/agent-sessions.mjs send other-session "API moved, update calls at src/api:42" --from my-session

# Live hand over (Radio)
node tools/agent-radio.mjs create-thread planning "claude,codex"
node tools/agent-radio.mjs send planning "found JWT race @codex" --mention @codex

# After task
# create new md with frontmatter, then:
node tools/agent-context-index.mjs
node tools/agent-context-validate.mjs
```

## References & attribution

- AgentRadio (Apache 2.0): `Coral-Protocol/AgentRadio` https://github.com/Coral-Protocol/AgentRadio — three primitives, five-phase protocol, passive awareness background vs blocking receive, no harness modification, no extra LLM calls — file-based adaptation, no `coral-server.jar` copied. See `docs/radio.md` `REFERENCES.md`.
- Claude sessions (reverse-engineered): https://code.claude.com/docs/en/cross-session-messaging v2.1.224, open-source reconstructions `LING71671/Open-ClaudeCode` `C293943/claude-code-open` `montisan/claude-code-source-code` `anthropics/claude-code` PR #41447 (Apache 2.0) — `ListAgents`/`SendMessage`/per-session socket/inbox/crossSessionInbound/isolatePeerMachines/plain text/rateLimit — file-based `sessions/inbox/*.jsonl` equivalent, no `cli.js` copied. See `docs/sessions.md`.

## Verification

```bash
node tools/agent-context-validate.mjs
node tools/agent-context-index.mjs --check
node tools/agent-sessions.mjs list
node tools/agent-radio.mjs list-threads
```
