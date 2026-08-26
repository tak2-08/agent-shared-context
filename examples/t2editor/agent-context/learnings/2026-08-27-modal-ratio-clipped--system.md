<!-- Path: T2Editor/agent-context/learnings/2026-08-27-modal-ratio-clipped--system.md -->
---
id: learning-20260827-00000001
type: learning
title: "모달 비율 고정 시 390px 버튼 잘림"
tags: [modal, ratio, 390px, pinned-actions]
feature: modal
scope: global
agent: system
created: 2026-08-27T00:00:00+09:00
updated: 2026-08-27T00:00:00+09:00
status: done
priority: 5
summary: "13:6 비율은 max-height 상한. 하한 고정 시 390px 잘림"
related: [decisions/0001-agent-context-structure.md]
affects: [modal, visual-system]
cause: "모달 비율(13:6 등 6개)을 height 고정값처럼 사용"
fix: "js/utils/modal.js:fitSurfaceToContent가 max-height까지 minHeight로만 늘이고, 남는 넘침은 내부 스크롤 + modal.css:162 t2-modal-pinned-actions sticky"
lesson: "비율은 상한(max-height), 하한 고정 금지. 버튼은 pinned-actions로 고정"
keywords:
  ko: [모달, 비율, 잘림, 고정]
  en: [modal, ratio, clipped, pinned]
  ja: [モーダル, 比率]
  zh: [模态, 比例]
---

## 현상
- `T2Editor/css/modal.css:29`의 `13:6` 등 6개 비례를 `height` 고정으로 쓰면 390px에서 마지막 버튼 행이 뷰포트 밖으로 잘린다.
- `tests/js/modal-basic-content-fit.test.mjs`가 0eac269에서 이 회귀를 잡음.

## 원인
- 비율은 설계상 `max-height` 상한이다. `T2Editor/js/utils/modal.js:fitSurfaceToContent`가 `max-height`까지만 `minHeight`로 늘이고, 나머지는 표면 내부 스크롤로 처리해야 한다.
- 하한처럼 고정하면 내용이 짧을 때도 강제로 늘어나고, 내용이 길면 스크롤 없이 잘린다.

## 해결
- `modal.css:162` `t2-modal-pinned-actions` (sticky bottom)로 마지막 실행행 고정.
- JS에서 `max-height` 상한 + `minHeight` 증가만 허용, 남는 넘침은 `overflow-y: auto`로 표면 내부 스크롤.

## 교훈
- **비율=상한**으로 기억. 고정 금지.
- 신규 모달은 반드시 `390px + 내부 스크롤 + pinned-actions` 3종을 함께 검증.
- 관련: `T2Editor/docs/ux-patch-plan-2026-08-25.md`

## 연관
- affects: `modal` → `visual-system` → `editor-surface`
- 다음 agent가 모달을 건드리면 이 파일을 먼저 읽을 것.
