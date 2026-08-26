<!-- Path: agent-context/diary/2026-08-27.md -->
---
id: diary-20260827
type: diary
title: "2026-08-27 작업 일지"
tags: [diary, 2026-08-27]
feature: global
scope: global
agent: system
created: 2026-08-27T00:00:00+09:00
updated: 2026-08-27T00:00:00+09:00
status: doing
priority: 3
summary: "프로젝트 작업 일지 — append-only"
related: []
---

## 09:10 claude — 작업 시작
- `Read agent-context/index.json`으로 기존 맥락 파악
- `graph.json`에서 영향 범위 확인

## 14:00 codex — 버그 수정
- `bugs/2026-08-27-xxx--codex.md` 생성, `related`에 `learnings/...` 연결
- `index.json` 재생성: `node tools/agent-context-index.mjs`

## 18:00 opencode — 학습 기록
- `learnings/2026-08-27-xxx--opencode.md`에 `cause/fix/lesson` 작성
- 다음 agent가 같은 실수 반복하지 않도록 `priority: 5`

<!-- diary는 절대 Write로 덮어쓰지 말고 Read 후 Edit로 append -->
