<!-- Path: agent-context/learnings/2026-08-26-jwt-race--claude.md -->
---
id: learning-20260826-aaa11111
type: learning
level: memo
title: "JWT race condition"
tags: [auth, jwt]
feature: auth
scope: global
agent: claude
created: 2026-08-26T11:00:26.279Z
updated: 2026-08-26T11:00:26.280Z
status: done
priority: 5
summary: "JWT refresh race → mutex 해결. 검증: src/auth/refresh.ts:42"
refs:
  - "src/auth/refresh.ts:42"
---

JWT race
