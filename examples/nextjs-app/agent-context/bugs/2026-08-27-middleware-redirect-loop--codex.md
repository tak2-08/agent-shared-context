<!-- Path: examples/nextjs-app/agent-context/bugs/2026-08-27-middleware-redirect-loop--codex.md -->
---
id: bug-20260827-b2c3d4e5
type: bug
title: "middleware 무한 리다이렉트 루프"
tags: [api, middleware, redirect, loop]
feature: api
scope: global
agent: codex
created: 2026-08-27T09:10:00+09:00
updated: 2026-08-27T09:10:00+09:00
status: open
priority: 4
summary: "matcher가 /api/auth를 포함해 미들웨어가 자기 자신을 리다이렉트"
related: [learnings/2026-08-27-rsc-cache-bug--claude.md]
affects: [api, auth]
repro: "GET /api/auth/callback?code=xxx → 307 loop, matcher: '/((?!_next).*)'"
fix: "middleware.ts:8 matcher에서 '/api/(.*)' 제외, '/api/auth' skip 조건 추가"
keywords:
  ko: [미들웨어, 리다이렉트]
  en: [middleware, redirect, loop]
---

## 재현
- `middleware.ts` `matcher: '/((?!_next|_static).*)'` + `NextResponse.redirect('/api/auth/signin')` → `/api/auth`도 인터셉트.

## 해결
- `matcher: ['/((?!api|_next|_static).*)']` 또는 `if (req.nextUrl.pathname.startsWith('/api')) return`.

## 연관
- `api` → `auth`
