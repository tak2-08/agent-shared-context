<!-- Path: docs/schema.md -->
# Frontmatter 스키마

모든 `agent-context/**/*.md`의 상단 `---` YAML이 따라야 할 규칙. `agent-context/schema.json` (draft-07)이 정본.

## 필수 10필드

| 필드 | 타입 | 예 | 설명 |
|---|---|---|---|
| `id` | string | `learning-20260827-a1b2c3d4` | `{type}-{YYYYMMDD}-{8hex}` 고유 |
| `type` | enum | `learning` | `note/memo/idea/learning/bug/decision/diary/code-history/todo/audit/session` (config.types) |
| `title` | string 5~80 | `JWT refresh 동시 요청 race` | 40자 내 권장, 검색 1순위 |
| `tags` | array 1~8 | `[auth, jwt, race]` | `^[a-z0-9-]+$`, kebab-case |
| `feature` | enum | `auth` | `config.features` 키 + `global`, graph와 연결 |
| `agent` | enum | `claude` | `config.agents.allow` |
| `created` | date-time | `2026-08-27T10:00:00+09:00` | ISO 8601 |
| `updated` | date-time | `2026-08-27T10:00:00+09:00` | 생성 시 `created`와 동일 |
| `status` | enum | `done` | `open/doing/done/archived/proposed/adopted/rejected/superseded` |
| `summary` | string ≤200 | `refresh를 mutex 없이 병렬 호출하면...` | index.json 노출, 본문 없이 판단 |

## 권장 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| `priority` | 1~5 | 5=반드시 봐야 할 교훈, 1=참고. index 정렬 기준 |
| `preview` | ≤60 | 자동 생성 (summary 앞 60자) |
| `related` | array | 상대 경로 `decisions/0001-*.md` |
| `affects` | array | 영향 feature 목록, graph.json과 동기화 |
| `scope` | `global/page/custom:*` | 기본 `global` |
| `cause/fix/lesson` | string | `learnings` 전용 |
| `repro` | string | `bugs` 전용 |
| `supersedes/superseded_by` | string | `decisions` ADR 체인 |
| `keywords` | object | `{ko:[], en:[], ja:[], zh:[]}` 다국어 검색 |

## 네이밍

| 타입 | 파일명 패턴 | 예 |
|---|---|---|
| note/memo/idea/learning/bug/todo | `YYYY-MM-DD-{slug}--{agent}.md` | `learnings/2026-08-27-jwt-race--claude.md` |
| diary | `YYYY-MM-DD.md` | `diary/2026-08-27.md` (agent suffix 없음, append-only) |
| decision | `NNNN-{slug}.md` | `decisions/0001-use-file-db.md` |
| code-history | `YYYY-MM-DD-{slug}--{agent}.md` | `code-history/2026-08-27-auth-fix--opencode.md` |

`slug`는 `a-z0-9-` 3~40자.

## 예시

```yaml
---
id: learning-20260827-a1b2c3d4
type: learning
title: "JWT refresh 동시 요청 시 race로 토큰 무효화"
tags: [auth, jwt, race, refresh]
feature: auth
scope: global
agent: claude
created: 2026-08-27T10:00:00+09:00
updated: 2026-08-27T10:00:00+09:00
status: done
priority: 5
summary: "refresh를 mutex 없이 병렬 호출하면 두 번째 토큰이 첫 번째를 덮어 로그아웃됨"
related: [decisions/0001-use-file-db.md]
affects: [auth, api]
keywords:
  ko: [인증, 갱신]
  en: [auth, refresh]
---
```

## 검증

```bash
node tools/agent-context-validate.mjs
node tools/agent-context-index.mjs --check
```

`schema.json`의 `feature` enum은 `agent-context.config.json` `features`로부터 `--init` 시 자동 재생성.
