<!-- Path: T2Editor/agent-context/README.md -->
# Agent Context — AI Agent 공용 컨텍스트 DB

> **목표**: 클로드급 저용량·고비용 에이전트가 **최소 토큰으로 최대 정보를 가장 빠르게** 얻고, 작업 중 특이사항·아이디어·실패원인·이슈를 남겨 다음 에이전트가 배우며, **기능 간 연관성을 한눈에** 파악하는 공용 기억.

`T2Editor/js/utils/ai/tools/memory.js:60`의 `t2ai_mem_v1`은 브라우저 `localStorage`에 갇혀 agent 간 공유 불가. 이 DB는 **Git 커밋형 공용 기억**으로 모든 agent(Claude/Codex/Opencode)가 `git pull`만으로 동기화한다.

- **정본**: `T2Editor/agent-context/` (1층, Git 추적) — `T2Editor-v11/.gitignore:8`은 `/T2Editor/data/`만 무시하므로 이 경로는 **커밋 가능**
- **런타임(선택)**: `{T2EDITOR_PRIVATE_PATH}/agent-context/runtime.php` via `T2Editor/config/t2_private_store.php:67` `t2_private_store_write/read`
- **검증**: `T2Editor/tools/t2-release-gate.sh` SCAN=`T2Editor tools tests`에 포함 → `node --check`/`JSON.parse`/`t2-static-check.mjs:353` 통과해야 함

---

## 토큰 절약 3단계 프로토콜 (필수 순서)

저용량 에이전트는 **절대 모든 파일을 한 번에 읽지 않는다**. 아래 순서로 **점진 공개**하면 90% 토큰을 절약한다.

```
1단계 L1 — index.json 1회 읽기 (전체 요약, ~50토큰/entry)
  → Read T2Editor/agent-context/index.json
  → entries[].title/tags/summary/preview/related 로 관련성 판단

2단계 L2 — graph.json / features.json 1회 읽기 (연관성 파악)
  → Read T2Editor/agent-context/graph.json        # 기능 간 의존 그래프
  → Read T2Editor/agent-context/features.json     # 기능별 파일 매핑

3단계 L3 — 필요한 md 1~2개만 읽기 (상세)
  → Grep pattern="검색어" path="T2Editor/agent-context"  # frontmatter만 스캔
  → Read T2Editor/agent-context/bugs/2026-08-27-xxx--agent.md
```

| 방법 | 토큰 | 비교 |
|---|---|---|
| ❌ `Glob + Read *.md 10개` | ~12,000 | 전체 |
| ✅ `index.json + Read 2개` | ~2,200 | **82% 절약** |
| ✅ `Grep + index.json + Read 1개` | ~1,400 | **88% 절약** |

**규칙**: 1 PR = 1 파일, `Read` 후 `Edit`(절대 `Write` 덮어쓰기 금지), `diary/YYYY-MM-DD.md`는 append-only.

---

## 디렉터리 맵 (한눈에)

```
T2Editor/agent-context/
 ├─ README.md              # 이 파일 — 진입점
 ├─ index.json             # L1 압축 카탈로그 (토큰 절약 핵심)
 ├─ graph.json             # L2 기능 연관 그래프
 ├─ features.json          # L2 기능 레지스트리 (파일:라인 매핑)
 ├─ schema.json            # frontmatter JSON Schema
 ├─ notes/                 # 특이사항·관찰 (자유 메모)
 ├─ ideas/                 # 아이디어 (proposed→adopted/rejected)
 ├─ learnings/             # 실패 원인·교훈·gotcha (다음 agent가 반드시 봐야 할 것)
 ├─ bugs/                  # 재현·원인·수정·회귀 묶음
 ├─ decisions/             # ADR NNNN-*.md (확정 결정)
 ├─ code-history/          # 코드 결정 배경
 ├─ diary/                 # 일자별 작업 일지 YYYY-MM-DD.md (append-only)
 ├─ todos/                 # 할 일 (open/doing/done)
 └─ archive/               # 90일 이후 이동 (soft delete)
```

---

## 기능 연관 그래프 미리보기 (상세는 graph.json)

```
foundation (t2-foundation.css 토큰)
 ├─→ visual-system (t2-visual-system.css 크롬)
 │    ├─→ toolbar (t2-toolbar-pending, reveal)
 │    ├─→ modal (modal.css 13:6 비율, pinned-actions)
 │    └─→ editor-surface (container-type, flex/grid 붕괴)
 ├─→ content (content.css, --t2-s* 사다리)
 └─→ ai (js/utils/ai/ 27 tools, memory.js)

editor-core (editor.core.php)
 ├─→ plugin/* (15개 번들)
 ├─→ modules/* (modal, toast)
 └─→ config/* (t2_storage.php, t2_private_store.php)
```

> `graph.json`에서 `depends_on`/`affects`/`files`/`decisions`로 기계 탐색 가능.

---

## 빠른 검색 쿼리 (복붙용)

```bash
# 1. 전체 요약 훑기 (가장 먼저)
Read T2Editor/agent-context/index.json

# 2. 연관성 파악
Read T2Editor/agent-context/graph.json
Read T2Editor/agent-context/features.json

# 3. 키워드 필터 (frontmatter만)
Grep pattern="toolbar" path="T2Editor/agent-context" include="*.md"
Grep pattern="^tags:.*pending" path="T2Editor/agent-context"
Grep pattern="^feature: ai" path="T2Editor/agent-context"
Grep pattern="실패|gotcha|주의" path="T2Editor/agent-context/learnings"

# 4. 타입·상태·일자 필터
Glob pattern="T2Editor/agent-context/learnings/*.md"
Grep pattern="^status: open" path="T2Editor/agent-context/todos"
Glob pattern="T2Editor/agent-context/diary/2026-08-*.md"
Grep pattern="^priority: [45]" path="T2Editor/agent-context"

# 5. 관련 체인 추적
Read T2Editor/agent-context/bugs/2026-08-27-xxx--codex.md
# → related: [learnings/..., decisions/0001-*.md] 따라가기

# 6. 파일 라인으로 역추적
Grep pattern="t2-foundation.css:299" path="T2Editor/agent-context"
```

---

## 새 글 쓰기 (5줄 템플릿)

```markdown
<!-- Path: T2Editor/agent-context/learnings/2026-08-27-xxx--claude.md -->
---
id: learning-20260827-a1b2c3d4
type: learning
title: "모달 비율을 하한처럼 고정하면 390px에서 버튼 잘림"
tags: [modal, ratio, 390px]
feature: modal
scope: global
agent: claude
created: 2026-08-27T10:00:00+09:00
updated: 2026-08-27T10:00:00+09:00
status: done
priority: 5
summary: "modal 13:6은 max-height 상한, fitSurfaceToContent가 minHeight로만 늘이고 나머지는 스크롤+sticky"
related: [decisions/0001-agent-context-structure.md, bugs/2026-08-27-xxx--codex.md]
affects: [modal, visual-system]
cause: "비율 고정"
fix: "js/utils/modal.js:fitSurfaceToContent + modal.css:162 t2-modal-pinned-actions"
lesson: "비율은 상한, 넘침은 내부 스크롤"
keywords:
  ko: [모달, 비율, 잘림]
  en: [modal, ratio, clipped]
---
## 현상
...
## 원인
...
## 해결
...
## 교훈
...
```

- **파일명**: `YYYY-MM-DD-{slug}--{agent}.md` (`slug`는 `a-z0-9-` 3~40자)
- **diary만 예외**: `diary/YYYY-MM-DD.md`는 agent suffix 없이 `## HH:MM agent — 제목` append
- **decisions만 예외**: `decisions/NNNN-{slug}.md` (`0001`부터)
- **필수 필드**: `id, type, title, tags, feature, agent, created, updated, status, summary`

---

## 타입별 용도 (goal 대응)

| type | 담는 것 | goal 대응 |
|---|---|---|
| `learnings` | 실패 원인·gotcha·교훈 (`cause/fix/lesson`) | 실패 이유 → 다음 agent가 반복 방지 |
| `bugs` | 재현·원인·수정·회귀 (`repro/fix_pr`) | 이슈 기록·연계 |
| `ideas` | 가설·제안 (`status: proposed`) | 아이디어 공유 |
| `notes` | 특이사항·관찰·링크 | 작업 중 특이사항 |
| `decisions` | ADR (확정 결정, superseded 체인) | 기능 연관성 정본 |
| `diary` | 일자별 append 일지 | 작업 흐름 학습 |
| `code-history` | 코드 변경 배경 | 히스토리 추적 |

`feature` 필드와 `graph.json`/`features.json`으로 모든 글은 **기능 그래프에 연결**된다. 한 기능을 고치면 `affects`를 따라 영향 범위를 즉시 안다.

---

## 운영

- **용량**: `SOFT_LIMIT_CHARS=200000`, `MAX_ENTRIES=1000` 초과 시 `index.json:soft_limits.should_compress=true` → 낮은 `priority`부터 `archive/` 이동
- **삭제**: `status: archived` 소프트 삭제, `git rm`은 30일 후 사람 승인 시만
- **갱신**: 수정 시 `updated`/`updated_by` 갱신 + 본문 하단 `## 변경 이력` append
- **index 재생성**: `node tools/agent-context-index.mjs` (선택, `T2Editor/agent-context/*.md` → `index.json`/`graph.json` 갱신)

참조: `T2Editor/developer/t2-design-system.md`, `T2Editor/css/t2-foundation.css:299`, `T2Editor/js/utils/ai/tools/memory.js:60`, `T2Editor/config/t2_private_store.php:67`, `tools/t2-static-check.mjs:353`
