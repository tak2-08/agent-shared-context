---
name: agent-shared-context
description: "Inter-agent shared context DB — token-saving 3-layer (index→graph→md) + live radio/sessions for OpenCode/Codex. Share context among agents via git + file inbox, 82% cheaper."
allowed-tools: "read, edit, write, bash, grep, glob"
---

# agent-shared-context — OpenCode / Codex Skill

> **Universal skill** for OpenCode, Codex, and any agent. Same protocol as Claude Code skill, but as a generic markdown skill (no Claude-specific `allowed-tools` enforcement). For Claude Code, see `.claude/skills/agent-shared-context/SKILL.md`.

## Purpose

Let **any** AI agent (Claude/Codex/OpenCode) **share context via git** (persistent) and **via file inbox/radio** (live), with 82% token saving. Inter-agent, multi-agent, cross-session.

## When to use

- Recall prior `learnings`/`decisions`/`bugs` before coding → `Read agent-context/index.json`
- Hand over finding to another agent mid-task → `node tools/agent-sessions.mjs send ...` / `node tools/agent-radio.mjs send ...`
- Coordinate 4 agents on long-horizon task → `node tools/agent-radio.mjs protocol` (P1-P5)

## 3-step protocol (82% cheaper)

```
1. Read agent-context/index.json          # L1 — 50 tok/entry
2. Read agent-context/graph.json + features.json  # L2 — graph
3. Grep then Read 1~2 md                  # L3 — detail
```

Never read all md at once.

## Persistent vs live

- **Persistent** (git): `agent-context/*.md` + `index.json` — `git pull` sync, `1 PR = 1 file`, `diary` append-only
- **Live sessions** (Claude reverse-engineered, file-based): `agent-context/sessions/sessions.json` + `inbox/<name>.jsonl`
  - `register` `list` `send` `inbox` `wait` — plain text only, `crossSessionInbound` `accept/hold/refuse`, `isolatePeerMachines`, rate-limit/dedup
  - Same-machine file inbox never traverses servers (like Unix socket); cross-machine via `git push` would traverse git remote
- **Live radio** (AgentRadio, Apache 2.0): `agent-context/radio/threads/<name>.json`
  - `create-thread` `send_message` `wait_for_mention` — three primitives, five-phase protocol, **passive awareness** background task (no turn stolen) vs blocking receive

## Quick commands

```bash
# Persistent
Read agent-context/index.json
Grep pattern="auth" path="agent-context" include="*.md"
Read agent-context/bugs/xxx--agent.md

# Live (Claude)
node tools/agent-sessions.mjs register my-session
node tools/agent-sessions.mjs list
node tools/agent-sessions.mjs send other-session "msg" --from my-session
node tools/agent-sessions.mjs inbox my-session

# Live (Radio)
node tools/agent-radio.mjs create-thread planning "a,b"
node tools/agent-radio.mjs send planning "hello @codex" --from claude
node tools/agent-radio.mjs wait codex --timeout 30000
node tools/agent-radio.mjs protocol
```

## Frontmatter (10 required)

`id` `type` `title` `tags` `feature` `agent` `created` `updated` `status` `summary` — see `docs/schema.md` `agent-context/schema.json`

## Attribution

- **AgentRadio** (Apache 2.0) `Coral-Protocol/AgentRadio` — three primitives, five-phase P1-P5, passive awareness background vs blocking, no harness modification, no extra LLM calls, model-agnostic — file-based, no `coral-server.jar`. See `docs/radio.md`.
- **Claude sessions** (reverse-engineered) https://code.claude.com/docs/en/cross-session-messaging v2.1.224 + open-source `LING71671/Open-ClaudeCode` `C293943/claude-code-open` `montisan/claude-code-source-code` — `ListAgents`/`SendMessage`/socket/inbox/inbound/rateLimit — file-based `sessions/inbox/*.jsonl`. See `docs/sessions.md`.
- **License**: This skill is MIT, referenced concepts are Apache 2.0 with attribution in `REFERENCES.md` and per-doc.

## Installation

```bash
# OpenCode
cp -r skills/agent-shared-context ~/.config/opencode/skills/
# or project-local: already in skills/agent-shared-context/SKILL.md, OpenCode auto-discovers

# Codex
cp -r skills/agent-shared-context ~/.codex/skills/  # if Codex supports skills dir
# or use as prompt: Read skills/agent-shared-context/SKILL.md
```

## Verification

```bash
node tools/agent-context-validate.mjs
node tools/agent-context-index.mjs --check
```

For Claude Code, this skill is also at `.claude/skills/agent-shared-context/SKILL.md` (same content, Claude-specific `allowed-tools`).
