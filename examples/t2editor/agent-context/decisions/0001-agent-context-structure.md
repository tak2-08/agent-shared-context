<!-- Path: T2Editor/agent-context/decisions/0001-agent-context-structure.md -->
---
id: decision-20260827-0001
type: decision
title: "agent-context를 파일+index 2층 구조로 결정"
tags: [agent-context, architecture, file-db]
feature: storage
scope: global
agent: system
created: 2026-08-27T00:00:00+09:00
updated: 2026-08-27T00:00:00+09:00
status: adopted
priority: 5
summary: "T2Editor/data 대신 T2Editor/agent-context 파일 DB, index+graph로 토큰 절약"
related: [learnings/2026-08-27-modal-ratio-clipped--system.md, bugs/2026-08-27-toolbar-pending-2line--system.md]
affects: [storage, ai]
supersedes: null
superseded_by: null
keywords:
  ko: [공용 컨텍스트, 구조, 파일 DB]
  en: [agent context, architecture, file db]
---

## Context
- 기존 `T2Editor/js/utils/ai/tools/memory.js:60`은 `localStorage`라 agent 간 공유 불가.
- `T2Editor/data/`는 `T2Editor-v11/.gitignore:8` + `tools/t2-static-check.mjs:353` 금지 구역이라 커밋 불가.
- 클로드급 저용량 에이전트는 전체 파일을 읽으면 토큰 고갈, **점진 공개**가 필요.

## Decision
- **1층 Git 커밋형**: `T2Editor/agent-context/` — 정본, PR로 리뷰, `T2Editor/tools/t2-release-gate.sh` SCAN 포함.
- **2층 런타임(선택)**: `{T2EDITOR_PRIVATE_PATH}/agent-context/runtime.php` via `T2Editor/config/t2_private_store.php:67`.
- **L1 index.json** — 50토큰/entry 압축 카탈로그, `preview 60자 + summary 120자`로 본문 없이 판단.
- **L2 graph.json + features.json** — 기능 의존 그래프, 한눈에 영향 범위 파악.
- **L3 *.md** — 상세는 필요 시 1~2개만 읽기.

## Alternatives 고려
- SQLite 단독: git 공유 불가, PR 리뷰 불가, `release-artifact`는 아니나 서버별 분리라 agent 공유 실패 → **기각**.
- JSON 단독(1파일에 전체): 충돌 빈발, diff 가독성 0 → **기각**.
- 파일+SQLite 하이브리드: 1000개 초과 시에만 파생 인덱스로 확장 (Phase 2).

## Consequences
- 긍정: `Read index.json` 1회로 82% 토큰 절약, `Grep ^tags:`로 frontmatter만 스캔, `related/affects`로 연관 추적.
- 부정: 1000개 초과 시 Grep 500ms → Phase 2에서 `tools/agent-context-index.mjs`로 SQLite FTS 파생.
- 검증: `bash tools/t2-release-gate.sh --quick` 통과, `node tools/t2-static-check.mjs` 0건.

## Links
- PR: (this PR)
- 관련: `T2Editor/config/t2_storage.php:284`, `T2Editor/config/t2_cms_data.php:37`
