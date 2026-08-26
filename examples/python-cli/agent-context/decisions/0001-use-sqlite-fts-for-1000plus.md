<!-- Path: examples/python-cli/agent-context/decisions/0001-use-sqlite-fts-for-1000plus.md -->
---
id: decision-20260827-0001
type: decision
title: "1000+ entries에서 SQLite FTS 파생 인덱스"
tags: [storage, sqlite, fts, decision]
feature: storage
scope: global
agent: system
created: 2026-08-27T00:00:00+09:00
updated: 2026-08-27T00:00:00+09:00
status: adopted
priority: 5
summary: "Grep 500ms → FTS 20ms, md 정본 유지, search.db는 파생"
related: [learnings/2026-08-27-click-group-invoke--system.md]
affects: [storage, cli]
supersedes: null
superseded_by: null
keywords:
  ko: [저장소, 인덱스]
  en: [storage, sqlite, fts]
---

## Context
- 500개 초과 시 `Grep` 500ms, `storage.backend=json`만으로는 느림.

## Decision
- `storage.backend=sqlite`, `privateMirror=.agent-context-runtime`
- `node tools/agent-context-index.mjs --to-sqlite`로 `search.db` FTS5 생성
- `CREATE VIRTUAL TABLE ctx USING fts5(id, title, summary, tags, feature, body)`

## Alternatives
- Grep 유지: 1000+에서 체감 느림 → 기각 (조건부 유지)
- JSON 인덱스만: 구조적 쿼리 불가

## Consequences
- `python -m agent_context search "auth"` 래퍼 제공 (선택)

## Links
- `agent-context.config.json` `storage.backend`
