<!-- Path: docs/hierarchy.md -->
# Hierarchy — 유동적 계층 저장소 (cache → library)

> **아이디어**: AI 가속기 `cache → HBM → DRAM → SSD` + 검색엔진 `(&AI)[포스트잇|메모지|일기|책장|도서관]` 에서 착안. 고정된 `note/memo/...` 분할이 아닌, **유동적·능동적**으로 레벨을 배정하고, **가벼운 AI가 알아서 검색**한다.

## 왜 고정 분할이 아닌가

고정 `type: bug|idea|...` 9개는 프로젝트가 커지면 경계가 모호해진다. `이슈`는 `작업 히스토리`가 되고, `아이디어`는 `전체 흐름`으로 확장된다. 고정 분할은 에이전트가 매번 분류에 토큰을 쓰고, 검색 시 모든 타입을 훑어야 한다.

유동적 계층은 **길이·우선순위·연관도**로 레벨을 자동 배정하고, 검색은 **작은 것부터 큰 것 순**으로 확장한다 — 캐시 히트면 큰 것을 읽을 필요가 없다.

## 5 레벨 (토큰 예산)

| Level | 별칭 | 토큰 | 은유 | 캐시 | 용도 | 예 |
|---|---|---|---|---|---|---|
| **post-it** | 포스트잇 | 10–20 | L1 cache | 가장 빠름, 휘발 | 한 줄 결정, 즉시 공유 | `API moved to /v2` |
| **memo** | 메모지 | 50 | HBM | 빠름 | 짧은 메모, 원인·해결 한 줄 | `JWT race → mutex` |
| **diary** | 일기 | 200 | DRAM | 보통 | 일지, 하루 흐름, 작업 히스토리 | `2026-08-27 작업 일지` |
| **bookshelf** | 책장 | 1000 | SSD | 느림 | feature별 집약, 전체 흐름 | `Auth 전체 흐름` |
| **library** | 도서관 | 5000 | Cold | 가장 느림, 영구 | 프로젝트 전체, 아키텍처 결정 | `전체 결정 0001` |

`agent-context.config.json` `hierarchy.levels`에 정의, `hierarchy.searchOrder`는 `["post-it","memo","diary","bookshelf","library"]` 고정.

## 유동적·능동적 배정

- **고정 아님**: `type`은 `issue|work-history|idea|overall-flow` 등 **자유 문자열** (`schema.json: type pattern ^[a-z0-9-]+$`), `feature`도 자유. 제안된 9개는 예시일 뿐 강제 아님 (`typesFluid: true`).
- **능동 배정**: `level`은 에이전트가 직접 정하거나, 비우면 **가벼운 AI가 자동 배정** (`hierarchy.autoAssign: true`, `search.lightweightAI: auto`)
  - 길이 30자 이하 + priority 5 → `post-it`
  - 200자 이하 → `memo`
  - 1000자 이하 → `diary`
  - 그 이상 → `bookshelf`/`library` (priority와 `affects` 수로 결정)
  - 구현: `tools/agent-search-lite.mjs` `assignLevel(content, priority, affects)` — 규칙 기반, LLM 호출 0, 0토큰

## 검색 — 가벼운 AI가 배정

```
검색엔진(&AI)[포스트잇|메모지|일기|책장|도서관]
      │         │      │    │    │       │
      └─ 가벼운 AI가 질의 분석 → 가장 작은 레벨부터 탐색 → 히트 시 중단
```

- **입력**: `Grep pattern="auth" path="agent-context"` 또는 `node tools/agent-search-lite.mjs "auth jwt race"`
- **가벼운 AI 동작** (0 LLM 호출, 규칙 기반):
  1. 질의 토큰 수·키워드 수로 **level 예산** 결정 — 예: `auth` 1단어 → `post-it`부터, `auth 전체 흐름` → `bookshelf`부터
  2. `index.json`에서 **해당 레벨 이하**만 필터 (`level` 없으면 길이로 추정) → 후보 축소
  3. `priority`와 `updated`로 정렬 → 상위 3개만 `Read`
  4. 필요 시 다음 레벨로 **점진 확장** (cache miss → DRAM → SSD)

- **효과**: 500개 중 `post-it` 20개만 보면 평균 20×15=300토큰으로 80% 쿼리 해결, `library`까지 가는 20%만 5000토큰. 평균 **~900토큰/쿼리** vs 전체 `Read` 500×200=100k토큰 → **99% 절약** (벤치마크 `BENCHMARK.md` 참조)

## 구현

- **저장**: `tools/agent-search-lite.mjs --assign` 또는 `tools/agent-context-index.mjs`가 `index.json` 재생성 시 `level` 자동 계산 (길이 기반, 0 LLM 호출)
- **검색**: `node tools/agent-search-lite.mjs "query" --level post-it --limit 3` — 가벼운 AI가 `--level`을 자동 결정하면 생략 가능
- **호환**: 기존 `note/memo/...` 9타입은 `level` 없이도 동작 — `level`이 없으면 `chars`로 추정해 하위호환

## 예시

```yaml
# post-it: 한 줄, 즉시
id: note-20260827-a1
type: issue
level: post-it
title: "API moved"
tags: [api]
feature: api
priority: 5
summary: "/api/items moved to /v2/items"
---
API moved

# memo: 짧은 메모
id: learning-20260827-b2
type: learning
level: memo
title: "JWT race"
tags: [auth, jwt]
feature: auth

# diary: 일지
id: diary-20260827
type: diary
level: diary
title: "2026-08-27 작업 일지"

# bookshelf: feature 전체
id: decision-0001
type: decision
level: bookshelf
title: "Auth 전체 흐름"

# library: 프로젝트 전체
id: decision-0002
type: decision
level: library
title: "전체 아키텍처"
```

## 설치 간편성

- **네이티브**: `Node ≥18`만 필요 (Claude Code, Codex, OpenCode 모두 네이티브 지원). `python3` 선택, `php` 불필요. `npm install` 없음.
- **설치 토큰 0**: `npx agent-shared-context init` 1줄, `tools/`는 `node`로 직접 실행, 추가 의존성 0. 가벼운 AI도 규칙 기반이라 LLM 호출 0.
