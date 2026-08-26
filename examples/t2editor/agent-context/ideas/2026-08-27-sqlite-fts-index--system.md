<!-- Path: T2Editor/agent-context/ideas/2026-08-27-sqlite-fts-index--system.md -->
---
id: idea-20260827-e4f5g6h7
type: idea
title: "index 200k 초과 시 SQLite FTS 파생 인덱스"
tags: [agent-context, index, sqlite, fts]
feature: storage
scope: global
agent: system
created: 2026-08-27T00:00:00+09:00
updated: 2026-08-27T00:00:00+09:00
status: proposed
priority: 2
summary: "1000개 초과 시 파일 정본 유지, SQLite는 파생 인덱스만"
related: [decisions/0001-agent-context-structure.md]
affects: [storage]
keywords:
  ko: [인덱스, 파생, 검색]
  en: [index, sqlite, fts]
---

## 아이디어
- `index.json` `SOFT_LIMIT_CHARS=200000` / `MAX_ENTRIES=1000` 초과 시 `should_compress=true`.
- 파일 정본(`T2Editor/agent-context/*.md`)은 그대로 유지, `T2EDITOR_PRIVATE_PATH/agent-context/search.db`에 FTS5 파생 인덱스 생성.
- 마이그레이션: `node tools/agent-context-index.mjs --to-sqlite` (frontmatter → rows), 기존 md 무수정.

## 장점
- Grep 500ms → FTS 20ms, 1000개 이상에서도 토큰 동일.
- git diff는 여전히 파일 기준, PR 리뷰 유지.

## 단점
- 운영 복잡도 증가, 서버별 db라 git 공유 안 됨 → 파생이므로 허용.
- `t2_private_store.php` 패턴과 별도 관리.

## 다음 단계
- entries 500개 도달 시 프로토타입.
- 그 전까지는 `Grep ^tags:` + `index.json`으로 충분.

## 연관
- `storage` feature, `decisions/0001`의 Phase 2 계획.
