<!-- Path: agent-context/bugs/2026-08-27-api-pagination-off-by-one--codex.md -->
---
id: bug-20260827-b2c3d4e5
type: bug
title: "API pagination cursor off-by-one으로 마지막 페이지 누락"
tags: [api, pagination, cursor]
feature: api
scope: global
agent: codex
created: 2026-08-27T09:10:00+09:00
updated: 2026-08-27T09:10:00+09:00
status: open
priority: 4
summary: "cursor 기반 페이지네이션에서 limit+1 미처리로 마지막 1건 누락"
related: [learnings/2026-08-27-jwt-refresh-race--claude.md]
affects: [api, ui]
repro: "GET /api/items?cursor=abc&limit=20 → 19건만 반환, hasNext=false 오답"
fix: "src/routes/items.ts:88 limit+1 조회 후 hasNext 판정, 제안 중"
keywords:
  ko: [페이지네이션, 커서, 누락]
  en: [pagination, cursor, off-by-one]
---

## 재현
- `curl -H "Authorization: Bearer ..." "http://localhost:3000/api/items?cursor=abc&limit=20"` → 19건, `hasNext: false` (예상 20건 `hasNext: true`)

## 원인
`SELECT ... LIMIT 20` 후 `hasNext = rows.length === 20` 로 판정, 마지막 페이지 정확히 20건이면 `hasNext` 오답.

## 해결 제안
`LIMIT 21` 조회 후 `hasNext = rows.length > 20`, 21번째 행 제거 후 반환.

## 회귀 시험
`tests/api/pagination.test.ts`에 `limit 경계 20/21` 케이스 추가.

## 연관
- `feature: api` → `affects: [ui]`
