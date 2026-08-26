---
name: agent-shared-context
description: "Inter-agent shared context DB — token-saving 3-layer (index→graph→md) + hierarchical lightweight AI search (post-it→library, 0 LLM) + live radio/sessions for OpenCode/Codex. 82–99% cheaper."
allowed-tools: "read, edit, write, bash, grep, glob"
---

# agent-shared-context — OpenCode / Codex Skill

> **Universal skill** for OpenCode, Codex, and any agent. Same protocol as Claude Code skill, but as a generic markdown skill. For Claude Code, see `.claude/skills/agent-shared-context/SKILL.md`.

## Purpose

Let **any** AI agent (Claude/Codex/OpenCode) **share context via git** (persistent) and **via file inbox/radio** (live), with **hierarchical lightweight AI search** (post-it 15tok → library 5000tok) — up to 99% saving at scale.

## When to use

- Recall prior `learnings`/`decisions`/`bugs`/`issues`/`work-history` → `node tools/agent-search-lite.mjs "query"`
- Hand over finding mid-task → `node tools/agent-sessions.mjs send ...` / `node tools/agent-radio.mjs send ...`
- Coordinate multi-agent long-horizon → `node tools/agent-radio.mjs protocol` (P1-P5)

## Quick start (hierarchical lightweight AI)

```bash
node tools/agent-search-lite.mjs "your query" --limit 3
# → assigned level (post-it/memo/diary/bookshelf/library), top 3 with estTokens, saving %
# 0 LLM calls, 0 install — Node ≥18 only
```

## Hierarchy (fluid, cache-like)

| Level | tokens | 은유 |
|---|---|---|
| `post-it` | 15 | L1 cache / 포스트잇 — 한 줄 |
| `memo` | 50 | HBM / 메모지 — 짧은 메모 |
| `diary` | 200 | DRAM / 일기 — 일지·작업 히스토리 |
| `bookshelf` | 1000 | SSD / 책장 — feature 전체 흐름 |
| `library` | 5000 | cold / 도서관 — 프로젝트 아키텍처 |

- **유동적**: `type` 자유 (`issue|work-history|idea|overall-flow` 등)
- **능동적**: `level` 비우면 가벼운 AI가 자동 배정 (`--assign`)
- 검색은 가장 작은 레벨부터, 히트 시 중단 (cache hit)

## Persistent vs live

- **Persistent** (git): `agent-context/*.md` + `index.json` — `git pull` sync, `1 PR = 1 file`, `diary` append-only
- **Live sessions** (file-based): `agent-context/sessions/sessions.json` + `inbox/<name>.jsonl`
  - `register` `list` `send` `inbox` `wait` — plain text only, inbound `accept/hold/refuse`, rate-limit/dedup
- **Live radio** (file-based threads): `agent-context/radio/threads/<name>.json`
  - `create-thread` `send_message` `wait_for_mention` — five-phase protocol, passive awareness background vs blocking

## Quick commands

```bash
# Search (lightweight AI, hierarchical)
node tools/agent-search-lite.mjs "auth jwt race" --limit 3

# Live
node tools/agent-sessions.mjs register my-session
node tools/agent-sessions.mjs send other-session "msg" --from my-session
node tools/agent-radio.mjs send planning "hello @codex" --mention @codex
node tools/agent-radio.mjs wait codex --timeout 30000

# Save & validate
node tools/agent-context-index.mjs      # level auto-assign 포함
node tools/agent-context-validate.mjs

# Benchmark
node tools/benchmark.mjs                # writes BENCHMARK.md
```

## Frontmatter (10 required + level)

`id` `type`(유동: issue/work-history/idea/overall-flow 등 자유) `title` `tags` `feature` `agent` `created` `updated` `status` `summary` + `level`(비우면 auto: post-it/memo/diary/bookshelf/library) — see `docs/schema.md` `docs/hierarchy.md`

## Session continuity — 압축 대체

```bash
# 세션 종료 전
node tools/agent-handoff.mjs save --session my --task "..." --done "a;b" --next "c;d"
# 새 세션 복원 (~600 tok)
Read agent-context/CURRENT.md
node tools/agent-handoff.mjs load
node tools/agent-search-lite.mjs "<query>"
```

**서브에이전트 불필요**: 모든 도구는 단일 Bash 호출. 메인 에이전트가 직접 검색, Node 없으면 Grep 폴백(`^level: post-it` → `^priority: [45]`). See `docs/session-continuity.md`.

## References

- Concepts from `Coral-Protocol/AgentRadio` (Apache 2.0) and contemporary session collaboration patterns — file-based adaptation. See `docs/radio.md` `docs/sessions.md` `docs/hierarchy.md` `REFERENCES.md`.
- Benchmark: `BENCHMARK.md` — objective, critical (hitRate·latency 함께), reproducible.

## Installation

```bash
# OpenCode
cp -r skills/agent-shared-context ~/.config/opencode/skills/

# Codex
cp -r skills/agent-shared-context ~/.codex/skills/
```

## Verification

```bash
node tools/agent-context-validate.mjs
node tools/agent-context-index.mjs --check
node tools/agent-search-lite.mjs "test" --limit 3
```
