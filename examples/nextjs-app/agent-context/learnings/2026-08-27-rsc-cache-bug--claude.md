<!-- Path: examples/nextjs-app/agent-context/learnings/2026-08-27-rsc-cache-bug--claude.md -->
---
id: learning-20260827-a1b2c3d4
type: learning
title: "RSC fetch 캐시로 stale 데이터 노출"
tags: [ui, rsc, cache, stale]
feature: ui
scope: global
agent: claude
created: 2026-08-27T10:00:00+09:00
updated: 2026-08-27T10:00:00+09:00
status: done
priority: 5
summary: "fetch에 cache: no-store 없이 RSC가 빌드타임 데이터를 재사용해 stale 노출"
related: [bugs/2026-08-27-middleware-redirect-loop--codex.md]
affects: [ui, api]
cause: "Server Component에서 fetch에 캐시 옵션 미지정"
fix: "src/app/page.tsx:12 fetch(url, { cache: 'no-store' }) 또는 revalidate: 0, next: { tags }"
lesson: "RSC fetch는 기본 캐시됨, 동적 데이터는 cache: no-store 필수"
keywords:
  ko: [캐시, 신선도]
  en: [cache, rsc, stale]
---

## 현상
- `src/app/page.tsx` Server Component에서 `fetch('/api/items')`가 빌드타임 스냅샷을 계속 반환.

## 원인
- Next.js 14 RSC는 `fetch`를 기본 `force-cache`로 취급.

## 해결
- `fetch('...', { cache: 'no-store' })` 또는 `export const revalidate = 0`.

## 교훈
- 동적 데이터는 항상 캐시 옵션 명시.

## 연관
- `ui` → `api`
