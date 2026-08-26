---
name: agent-shared-context
description: "Inter-agent shared context DB — token-saving 3-layer (index→graph→md) + hierarchical lightweight AI search (post-it→library, 0 LLM) + live radio/sessions. Use when you need to share context among Claude/Codex/OpenCode sessions, recall prior decisions/learnings/bugs, or coordinate live."
allowed-tools: "Read, Grep, Glob, Bash(node tools/agent-sessions.mjs *), Bash(node tools/agent-radio.mjs *), Bash(node tools/agent-context-index.mjs *), Bash(node tools/agent-context-validate.mjs), Bash(node tools/agent-search-lite.mjs *)"
---

# agent-shared-context — Claude Code Skill

> **Purpose**: Let Claude sessions **share context via git** (persistent) and **via file inbox/radio** (live), with **hierarchical lightweight AI search** (post-it 15tok → library 5000tok, like cache→HBM→DRAM→SSD) — up to 99% token saving at scale. Universal, no project-specific hardcoding.

## When to use

- You need to **recall prior decisions/learnings/bugs/issues/work-history** before starting a task → `node tools/agent-search-lite.mjs "query"` (lightweight AI assigns level, searches smallest first)
- You need to **hand over a finding** to another session mid-task → `node tools/agent-sessions.mjs send <target> <msg>` or `node tools/agent-radio.mjs send <thread> <msg> --mention @agent`
- You are **blocked** and another session has the answer → `node tools/agent-sessions.mjs wait <own-session>` or `node tools/agent-radio.mjs wait <own-agent>`
- You need to **coordinate 4 agents** on a long-horizon task → use five-phase protocol `node tools/agent-radio.mjs protocol`

## Quick start (3 steps, 82–99% cheaper)

```
1. node tools/agent-search-lite.mjs "your query"   # ★ lightweight AI — hierarchical, 0 LLM calls
2. Read agent-context/index.json                    # L1 — full summary (if search misses)
3. Read 1~2 md from search results                  # L3 — detail only
```

**Never** `Glob + Read *.md all`. Always `search-lite` first — `post-it` hit ends at 15 tok.

## Hierarchy (fluid, cache-like)

| Level | tokens | 은유 | 용도 |
|---|---|---|---|
| `post-it` | 15 | L1 cache / 포스트잇 | 한 줄 결정 |
| `memo` | 50 | HBM / 메모지 | 짧은 메모 |
| `diary` | 200 | DRAM / 일기 | 일지·작업 히스토리 |
| `bookshelf` | 1000 | SSD / 책장 | feature 전체 흐름 |
| `library` | 5000 | cold / 도서관 | 프로젝트 아키텍처 |

- **유동적**: `type` 자유 (`issue|work-history|idea|overall-flow` 등), 고정 enum 아님
- **능동적**: `level` 비우면 가벼운 AI가 길이·우선순위로 자동 배정 (`--assign`)
- **검색**: 질의 단어 수로 시작 레벨 결정 (`auth`→post-it, `overall flow`→bookshelf), 히트 시 중단

## File protocol

- **Persistent**: `agent-context/*.md` + `index.json`/`graph.json`/`features.json`/`schema.json` — git-tracked, `git pull` sync, `1 PR = 1 file`, `Read` then `Edit` (never `Write` overwrite), `diary/YYYY-MM-DD.md` append-only
- **Live sessions** (file-based): `agent-context/sessions/sessions.json` registry + `sessions/inbox/<name>.jsonl` per-session file inbox
  - `node tools/agent-sessions.mjs register <name>` — bind inbox
  - `node tools/agent-sessions.mjs list` — session discovery, own first
  - `node tools/agent-sessions.mjs send <target> <msg> --from <own>` — plain text only, respects inbound `accept/hold/refuse` + rate-limit/dedup/max 50/100
  - `node tools/agent-sessions.mjs inbox <session>` — read between tool calls, idle → new turn
  - `node tools/agent-sessions.mjs wait <session> --timeout 30000` — wait for mention with full snapshot
- **Live radio** (file-based threads, passive awareness): `agent-context/radio/threads/<name>.json`
  - `node tools/agent-radio.mjs create-thread <name> <participants...>` — create thread
  - `node tools/agent-radio.mjs send <thread> <content> --mention @agent` — send, passive awareness (no turn stolen)
  - `node tools/agent-radio.mjs wait <agent> --timeout 30000` — background wait, full thread snapshot
  - `node tools/agent-radio.mjs protocol` — P1 Explore → P2 Divide → P3 Execute → P4 Review → P5 Submit

## Session continuity — 압축 대체 (손실 0, ~600 tok 복원)

세션이 끝나거나 컨텍스트가 차도 걱정 없음 — 중요한 것은 작업 중 entry로 저장됨.

```bash
# 세션 종료 전 (~280 tok)
node tools/agent-handoff.mjs save --session my-session --task "auth 리팩터링" \
  --done "JWT race 수정;테스트 추가" --next "문서화;회귀 시험"
# → sessions/handoff/<date>--<name>.md + CURRENT.md 갱신

# 새 세션 첫 동작 (~600 tok 총)
Read agent-context/CURRENT.md                 # ~50 tok 포인터
node tools/agent-handoff.mjs load             # ~280 tok task/done/next
node tools/agent-search-lite.mjs "<query>"    # 심층은 온디맨드
```

**서브에이전트 불필요** — 모든 도구는 단일 Bash 호출. 메인 에이전트가 직접 검색하며, Node가 없으면 순수 Grep 폴백(`Grep ^level: post-it` → `^priority: [45]` 순)으로도 동일 결과. 상세는 `docs/session-continuity.md`.

## Five-phase protocol (multi-agent)

- **P1 Explore**: every agent starts background watcher, drafts sub-questions, nothing sent
- **P2 Divide**: coordinator opens planning thread, negotiate partition until every agent approves
- **P3 Execute**: each works sub-questions, discovery triggers worklog post immediately — passive awareness lands mid-flight
- **P4 Review**: broadcast findings with evidence, reviewers post conflicts, can send back to P3
- **P5 Submit**: coordinator composes final answer, broadcasts draft for approvals, submits

## Frontmatter (10 required + level)

```yaml
id: issue-20260827-a1b2c3d4
type: issue            # 유동적! issue/work-history/idea/overall-flow/note/learning 등 자유
level: post-it         # 비우면 가벼운 AI가 자동 배정 (post-it/memo/diary/bookshelf/library)
title: "≤80 chars"
tags: [auth, jwt]
feature: auth          # 자유 확장 가능
agent: claude
created: 2026-08-27T10:00:00+09:00
updated: 2026-08-27T10:00:00+09:00
status: done
summary: "≤200 chars"
```

## Commands you should run

```bash
# Before task — lightweight AI search (hierarchical, 0 LLM)
node tools/agent-search-lite.mjs "auth jwt race" --limit 3
# → assigned level: memo, top 3 with estTokens, saving %

# Live hand over
node tools/agent-sessions.mjs register my-session
node tools/agent-sessions.mjs send other-session "API moved" --from my-session
node tools/agent-radio.mjs send planning "found JWT race @codex" --mention @codex

# After task — save with fluid type, level auto
# type: work-history (자유), level 비움 → lite AI 배정
node tools/agent-context-index.mjs      # level auto-assign 포함
node tools/agent-context-validate.mjs

# Benchmark (objective, reproducible)
node tools/benchmark.mjs                # synthetic 5/50/500, writes BENCHMARK.md
```

## Commands (슬래시 별칭 → 단일 Bash 호출)

스킬 커맨드는 `node tools/ac.mjs` 디스패처 하나로 통합 — 서브에이전트 불필요, 메인 에이전트가 직접 실행.

| 슬래시 별칭 | 실제 명령 | 동작 |
|---|---|---|
| `/ac-export` | `node tools/ac.mjs export --session S --task "..." --done "a;b" --next "c"` | 세션 내보내기 (핸드오프 저장 + CURRENT.md 갱신) |
| `/ac-import` | `node tools/ac.mjs import [file]` | 세션 불러오기 (복원 브리프 ~280 tok) |
| `/ac-current` | `node tools/ac.mjs current` | 현재 포인터 보기 |
| `/ac-history` | `node tools/ac.mjs history "query" --limit 3` | 히스토리·지식 검색 (계층, 0 LLM) |
| `/ac-issue` | `node tools/ac.mjs issue --title "..." [--feature F] [--refs "p1,p2"]` | 이슈 작성 |
| `/ac-learning` | `node tools/ac.mjs learning --title "..." --cause C --fix F2 --lesson L` | 교훈 기록 |
| `/ac-idea` | `node tools/ac.mjs idea --title "..."` | 아이디어 기록 |
| `/ac-note` / `/ac-todo` / `/ac-decision` | `node tools/ac.mjs note|todo|decision --title "..."` | 기타 타입 기록 |

## 결과 중심 기록 (원칙)

기록에는 **도구 호출 로그를 남기지 않는다**. 도구 사용 과정·출력 전문은 토큰 낭비:

```
❌ "Grep으로 검색하고 Read로 3개 읽었더니..."
✅ "JWT race → 전역 mutex 해결. 검증: src/auth/refresh.ts:42"
```

- 결론 + `refs`(검증 링크)만 저장. 다음 에이전트는 결론을 쓰거나 refs로 직접 확인
- 버그는 `repro`에 재현 레시피만 (이것도 과정 로그가 아니라 레시피)

## References

- Concepts from `Coral-Protocol/AgentRadio` (Apache 2.0) and contemporary session collaboration patterns — file-based adaptation. See `docs/radio.md` `docs/sessions.md` `docs/hierarchy.md` `REFERENCES.md`.
- Benchmark: `BENCHMARK.md` — objective, public-standard-like (tokens=chars/4, hit=title/tags/summary), critical (hitRate·latency 함께 공개).

## Verification

```bash
node tools/agent-context-validate.mjs
node tools/agent-context-index.mjs --check
node tools/agent-search-lite.mjs "test" --limit 3
node tools/agent-sessions.mjs list
node tools/agent-radio.mjs list-threads
```
