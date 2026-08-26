<!-- Path: agent-context/learnings/2026-08-27-jwt-refresh-race--claude.md -->
---
id: learning-20260827-a1b2c3d4
type: learning
title: "JWT refresh 동시 요청 시 race로 토큰 무효화"
tags: [auth, jwt, race, refresh]
feature: auth
scope: global
agent: claude
created: 2026-08-27T10:00:00+09:00
updated: 2026-08-27T10:00:00+09:00
status: done
priority: 5
summary: "refresh를 mutex 없이 병렬 호출하면 두 번째 토큰이 첫 번째를 덮어 로그아웃됨"
related: [decisions/0001-use-file-db.md, bugs/2026-08-27-refresh-race--codex.md]
affects: [auth, api]
cause: "클라이언트에서 만료 직전 3요청이 동시에 /refresh 호출"
fix: "src/auth/refresh.ts:42 mutex + dedup promise, 401 시 1회만 재시도"
lesson: "refresh는 전역 mutex로 단일화, 나머지는 대기열"
keywords:
  ko: [인증, 갱신, 경쟁조건]
  en: [auth, refresh, race]
  ja: [認証, リフレッシュ]
  zh: [认证, 刷新]
---

## 현상
만료 직전 다수 요청이 동시에 401을 받아 각각 `/refresh`를 호출, 두 번째 발급 토큰이 첫 번째를 덮어 로그아웃.

## 원인
`fetchWithAuth`가 요청별 독립적으로 refresh를 호출, `localStorage` 경쟁.

## 해결
`src/auth/refresh.ts:42` 전역 `refreshPromise` + `mutex`, 첫 호출만 네트워크, 나머지는 `await refreshPromise`.

## 교훈
refresh는 전역 mutex로 단일화. 401은 1회만 재시도, 그 이후는 로그아웃.

## 연관
- `feature: auth` → `affects: [api]`
- graph.json `auth → api` 간선
