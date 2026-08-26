<!-- Path: agent-context/decisions/0001-use-file-db-over-sqlite.md -->
---
id: decision-20260827-0001
type: decision
title: "파일+index 2층 구조로 결정 (SQLite 단독 기각)"
tags: [architecture, file-db, decision]
feature: api
scope: global
agent: opencode
created: 2026-08-27T00:00:00+09:00
updated: 2026-08-27T00:00:00+09:00
status: adopted
priority: 5
summary: "Git 정본 유지 위해 파일 DB + index/graph 선택, SQLite는 1000+ 파생만"
related: [learnings/2026-08-27-jwt-refresh-race--claude.md]
affects: [api, auth]
supersedes: null
superseded_by: null
keywords:
  ko: [구조, 파일 DB, 결정]
  en: [architecture, file db, decision]
---

## Context
- 브라우저 `localStorage`는 agent 간 공유 불가, `data/`는 배포 아티팩트 금지 구역.
- 파일 1개에 1000 entries를 넣으면 충돌·diff 가독성 붕괴.

## Decision
- **1층 Git 커밋형**: `agent-context/` — 정본, PR로 리뷰, `git blame` 가능
- **2층 런타임(선택)**: `.agent-context-runtime/search.db` (FTS5, 1000+ 시)
- **L1 index.json** 50토큰/entry, **L2 graph/features**, **L3 md** 1~2개

## Alternatives
- SQLite 단독: `git` 공유 불가, PR 리뷰 불가 → 기각
- JSON 단독(1파일): 충돌 빈발, `git diff` 가독성 0 → 기각
- 하이브리드: 파일 정본 + SQLite 파생 인덱스 → 채택 (Phase 2)

## Consequences
- 긍정: `Read index.json` 1회로 82% 토큰 절약, `Grep ^tags:`로 frontmatter만 스캔
- 부정: 1000+ 시 Grep 500ms → FTS 20ms 필요, 그 전까지는 파일로 충분
- 검증: `node tools/agent-context-index.mjs --check` 통과

## Links
- 관련: `agent-context.config.json`, `tools/agent-context-index.mjs`
