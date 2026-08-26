<!-- Path: agent-context/README.md -->
# Agent Context — My Project

> **목표**: 저용량 에이전트가 **최소 토큰으로 최대 정보를 가장 빠르게** 얻고, 작업 중 교훈·버그·아이디어를 남겨 다음 에이전트가 배우며, **기능 간 연관성을 한눈에** 파악하는 공용 기억.

- **정본**: `agent-context/` (1층, Git 추적) — `.gitignore`는 `/runtime/`만 무시하므로 이 경로는 **커밋 가능**
- **런타임(선택)**: `.agent-context-runtime/search.db` (backend=`json`, 1000+ 시 `sqlite`)
- **검증**: `node tools/agent-context-index.mjs --check` 통과해야 함

---

## 3단계 프로토콜 (필수 순서)

```
1단계 L1 — index.json 1회 읽기 (전체 요약, ~50토큰/entry)
  → Read agent-context/index.json

2단계 L2 — graph.json / features.json 1회 읽기 (연관성 파악)
  → Read agent-context/graph.json
  → Read agent-context/features.json

3단계 L3 — 필요한 md 1~2개만 읽기 (상세)
  → Grep pattern="검색어" path="agent-context" include="*.md"
  → Read agent-context/bugs/2026-08-27-xxx--agent.md
```

| 방법 | 토큰 | 비교 |
|---|---|---|
| ❌ `Glob + Read *.md 10개` | ~12,000 | 전체 |
| ✅ `index.json + Read 2개` | ~2,200 | **82% 절약** |
| ✅ `Grep + index.json + Read 1개` | ~1,400 | **88% 절약** |

**규칙**: 1 PR = 1 파일, `Read` 후 `Edit`(절대 `Write` 덮어쓰기 금지), `diary/YYYY-MM-DD.md`는 append-only.

---

## 디렉터리 맵

```
agent-context/
 ├─ index.json             # L1 압축 카탈로그
 ├─ graph.json             # L2 기능 연관 그래프
 ├─ features.json          # L2 기능 레지스트리
 ├─ schema.json            # frontmatter JSON Schema
 ├─ notes/  ideas/  learnings/  bugs/  decisions/  diary/  todos/  code-history/  archive/
```

## 빠른 검색 쿼리 (복붙용)

```bash
Read agent-context/index.json
Read agent-context/graph.json
Grep pattern="auth" path="agent-context" include="*.md"
Grep pattern="^feature: auth" path="agent-context"
Glob pattern="agent-context/learnings/*.md"
```

## 새 글 쓰기 (5줄 템플릿)

```markdown
<!-- Path: agent-context/learnings/2026-08-27-xxx--claude.md -->
---
id: learning-20260827-a1b2c3d4
type: learning
title: "한 줄 제목 (40자 내)"
tags: [auth, jwt]
feature: auth
agent: claude
created: 2026-08-27T10:00:00+09:00
updated: 2026-08-27T10:00:00+09:00
status: done
priority: 5
summary: "120자 내 요약 — index.json에 노출"
related: [decisions/0001-xxx.md]
affects: [auth, api]
keywords:
  ko: [인증, 토큰]
  en: [auth, token]
---
```

참조: `agent-context.config.json`, `tools/agent-context-index.mjs`, `docs/protocol.md`

---

## Agent (이 템플릿을 만든 주체)

- **Model**: `muse-spark-1.2-contributor-free` (Meta Muse Spark)
- **Environment**: `OpenCode` `linux` `bash`, repo `tak2-08/agent-shared-context` (구 `agent-context`, 2026-08-26 개명 — 에이전트 간 공유 명시)
- **생성**: 2026-08-27, `T2Editor-v11` `e42e8fd` 전수조사 후 범용 템플릿으로 추출
- 다음 에이전트는 `AGENT.md` `docs/agent-environment.md`에서 전체 환경 재현 가능
