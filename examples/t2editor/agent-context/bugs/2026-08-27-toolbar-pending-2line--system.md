<!-- Path: T2Editor/agent-context/bugs/2026-08-27-toolbar-pending-2line--system.md -->
---
id: bug-20260827-a1b2c3d4
type: bug
title: "toolbar pending 1.5s 저속기기 2줄 노출"
tags: [toolbar, pending, reveal, 390px]
feature: toolbar
scope: global
agent: system
created: 2026-08-27T09:10:00+09:00
updated: 2026-08-27T09:10:00+09:00
status: open
priority: 4
summary: "t2-toolbar-pending 1.5s reveal로 19개 버튼 2줄 노출"
related: [learnings/2026-08-27-modal-ratio-clipped--system.md, decisions/0001-agent-context-structure.md]
affects: [toolbar, visual-system, editor-surface]
repro: "Moto G4, 390px, 3G throttle, t2-visual-system.css:446 확인"
fix: "animation-delay 1.5s → 0.8s 제안, JS 사망 시 안전 공개 유지"
keywords:
  ko: [툴바, pending, 노출]
  en: [toolbar, pending, reveal]
---

## 재현
- 기기: Moto G4, 390px, 3G throttle
- 파일: `T2Editor/css/t2-visual-system.css:446` `t2-toolbar-reveal 0s 1.5s forwards`
- 증상: 19개 버튼이 2초간 2줄로 노출, 셸 밖 넘침
- 프로브: `tools/ux/_probe_embed.php?layout=flex`에서 재현, `_probe_editor.php` 단독은 미재현 (flex 부모 붕괴 미감지 `T2Editor-v11/AGENTS.md:52`)

## 원인
- 서버 마크업 `t2-toolbar-pending`이 첫 수용량 판정 전까지 셸 밖 넘침을 숨겨야 하는데, `1.5s` 뒤 자동 공개가 너무 늦음.
- `T2Editor/core/editor.core.php` pending 로직과 `t2-visual-system.css:446` delay 불일치.

## 해결 제안
- `animation-delay` `1.5s → 0.8s` 단축. JS 사망 시 안전 공개(`t2-toolbar-reveal`)는 유지 (`T2Editor-v11/AGENTS.md:45`).
- `tools/ux/t2-ux-check.mjs` delta로 390px/360px 스윕 재측정.

## 회귀 시험
- `tests/js/toolbar-*.test.mjs`에 390px 2줄 노출 케이스 추가 필요.
- 실기기: Android Chrome, iOS Safari 둘 다 360px 포함 검증.

## 연관
- `feature: toolbar` → `depends_on: [foundation, visual-system]` → `affects: [editor-surface]`
- graph.json에서 `toolbar → editor-surface` 간선 확인.
