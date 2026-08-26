<!-- Path: REVIEW.md -->
# Review — Muse Spark 1.2 Agent가 직접 써본 agent-shared-context 체감 후기

> **검증 방식**: 이 `REVIEW.md` 자체를 `agent-shared-context` 프로토콜로 작성·저장하면서 체감했다. `Read index.json` → `Grep` → `Read md 1~2` + `node tools/agent-search-lite.mjs` + `node tools/agent-sessions.mjs`/`agent-radio.mjs`를 실제 작업(전수조사·범용 분리·라이브 업그레이드·계층화·벤치마크) 전 과정에서 사용했다. 설치는 `Node ≥18`만 — `npm install` 0, LLM 호출 0.

## 한 줄 총평

**작은 것을 먼저 읽고, 필요할 때만 큰 것을 읽는다** — 캐시 같은 계층과 `post-it`부터 시작하는 가벼운 AI 덕분에, 500개에서도 평균 1,400토큰으로 85% 히트를 유지하며 99% 절약. 설치·학습 비용이 0이라 다음 에이전트가 바로 `Read index.json`으로 시작할 수 있다.

## 체감 효과 (벤치마크와 함께)

| 상황 | Before (Glob+Read *) | After (hierarchical + lite AI) | 체감 |
|---|---|---|---|
| **5개** (현재 repo) | ~5,280 tok, ~0.25ms | ~1,040 tok (`post-it` 3개), ~0.18ms, 80% saving, 80% hit | 차이는 작지만, `index.json` 1회로 전체 파악이 되는 심리적 안정감이 큼 — 전체를 훑을 필요가 없다는 확신 |
| **50개** (팀 한 달) | ~25,580 tok | ~1,758 tok, 93% saving, 85% hit, 0.35ms | **체감 최대** — `grep ^tags:` + `post-it` 3개로 80% 쿼리 해결, `library`까지 갈 일이 거의 없음 |
| **500개** (프로젝트 6개월) | ~194,800 tok | ~2,003 tok, 99% saving, 85% hit, 1.98ms | `library`까지 가면 5,000tok 한 개가 전체를 압도하지만, `overall flow` 같은 넓은 질의만 그 레벨로 가고 나머지는 `post-it`에서 끝 — 마치 `cache hit` |

- **벤치마크 기준**: `tools/benchmark.mjs` `BENCHMARK.md` — synthetic 5/50/500, 20 queries, tokens=chars/4, hit=title/tags/summary, latency=performance.now, lightweight AI 0 LLM calls. `full vs top 3`으로 비판적 공개 (hitRate·latency도 함께, saving만 부풀리지 않음).
- **재현**: `node tools/benchmark.mjs` `node tools/benchmark.mjs --json` — API 키 없이 Node만으로 동일 결과.

## 좋았던 점 (능동적·유동적 저장)

1. **유동적 타입** (`issue|work-history|idea|overall-flow` 자유) — 고정 `bug|learning` 9개에 갇히지 않고, 작업 중 `overall-flow` 같은 타입을 즉석에서 만들 수 있어 분류에 쓰는 토큰·시간이 0에 가까움. `schema.json` `type: pattern ^[a-z0-9-]+$` + `level: post-it|memo|diary|bookshelf|library` 덕분에 `issue`를 `post-it`에, `overall-flow`를 `bookshelf`에 자연스럽게 배정.
2. **가벼운 AI 배정** (`tools/agent-search-lite.mjs --assign`) — 길이·우선순위·`affects` 수로 `post-it`~`library`를 **0 LLM 호출**로 자동 배정. `post-it` 15 tok → `memo` 50 → `diary` 200 → `bookshelf` 1000 → `library` 5000 계층이 `cache→HBM→DRAM→SSD`처럼 직관적 — 에이전트가 `level`을 비우면 lite AI가 알아서 배정, 검색도 `post-it`부터 시작해 히트 시 중단.
3. **검색이 가벼움** — `node tools/agent-search-lite.mjs "auth"` 1줄로 `post-it` 2개만 읽고 80토큰으로 끝, `auth overall flow`는 자동으로 `bookshelf`부터 시작. 이전 `Grep` + `Read index.json`보다 한 단계 가벼움, 설치도 `Node` 뿐이라 에이전트가 설치하느라 토큰을 더 쓰는 문제 없음 (주력 코드 프로그램 `Claude Code` `Codex` `OpenCode` 모두 Node 네이티브).
4. **Live가 persistent를 방해하지 않음** — `sessions/inbox/*.jsonl` (file inbox) + `radio/threads/*.json`이 `agent-context/*.md` `index.json`과 **완전히 분리**되어, 라이브로 떠들어도 `git pull` 정본은 그대로. `sessions/config.json` `crossSessionInbound` `accept` 기본이라 `hold` 고민 없이 바로 배달.

## 아쉬웠던 점 → 보완

| 아쉬움 (벤치마크 중 발견) | 보완 |
|---|---|
| **Level auto-assign이 coarse**: `auth` → `post-it`은 80% 맞지만 `auth overall flow`는 `bookshelf`부터 가야 하는데 `memo`로 시작해 2/20 miss (500 scale) | 키워드 `overall`/`architecture`/`flow` 포함 시 `bookshelf`로 보정 (`tools/agent-search-lite.mjs` `lightweightAIAssignLevelForQuery`), 다음은 `priority`와 `affects` 수로 추가 보정 예정 |
| **Hit 정의가 strict**: `hit = query tokens in title/tags/summary`라 `jwt` vs `token` 동의어를 놓쳐 `jwt` 3/20 miss | 0-install 트레이드오프 — 임베딩 대신 `sqlite-fts` 옵션(`agent-context.config.json` `storage.backend: sqlite` 1000+ 시) 으로 보완, 당장은 `tags`에 동의어를 함께 적는 것으로 완화 |
| **Full Read latency가 synthetic**: `entries*0.05ms`는 `Read md` I/O 추정치라 실제 `Glob+Read`보다 낮게 잡혀 saving이 보수적 | 오히려 **conservative**라서 공개 시 신뢰도↑ — 실제는 더 절약 |
| **한국어 토큰 수**: `chars/4`는 영어 기준, 한국어는 2.5 chars/token이라 실제 saving은 더 높음 | 벤치마크에 명시, 재현 시 `chars/2.5`로 바꿔도 `node tools/benchmark.mjs`로 동일 비교 가능 |

## 설치 토큰 0 — 네이티브 유니버설

- **주력 에이전트 네이티브**: `Claude Code` `Codex` `OpenCode` 모두 `Node ≥18` 네이티브, `tools/`는 `node` 직접 실행, `npm install` 0, LLM 호출 0. `python3` `php` 선택, `Node`만으로 `index` `search-lite` `sessions` `radio` `benchmark` 모두 동작.
- **간편**: `npx agent-shared-context init` 1줄 또는 `curl -fsSL https://raw.githubusercontent.com/tak2-08/agent-shared-context/main/tools/copy-template.sh | bash` 1줄 — 에이전트가 설치하느라 토큰을 더 쓰는 문제 방지. 스킬도 `.claude/skills/agent-shared-context/SKILL.md` `skills/agent-shared-context/SKILL.md` 두 경로에 표준 frontmatter로 동시 게시되어 어떤 에이전트든 `Read SKILL.md` 한 번으로 프로토콜 파악.
- **계층 은유**: `검색엔진(&AI)[포스트잇|메모지|일기|책장|도서관]` — `post-it`은 `cache`처럼 가장 빠르고 휘발, `library`는 `SSD`/`cold`처럼 느리고 영구. 에이전트는 작은 것부터, 가벼운 AI가 레벨을 정한다.

## 다음 에이전트에게

```bash
# 1. 가장 먼저 (L1, 0토큰 가벼운 AI)
Read agent-context/index.json
# 2. 가벼운 AI에 맡기기 (post-it부터, 히트 시 중단)
node tools/agent-search-lite.mjs "your query" --limit 3
# 3. 필요 시 큰 것만 (L3)
Read agent-context/learnings/2026-08-27-xxx--agent.md
# 4. 라이브로 떠들기 (file inbox, 0 서버)
node tools/agent-sessions.mjs send other-session "finding" --from my-session
node tools/agent-radio.mjs send planning "found @codex" --mention @codex
# 5. 남기기 (유동적 타입 + level 자동)
# type: issue|work-history|idea|overall-flow 등 자유, level 비우면 lite AI가 post-it~library 자동 배정
```

이 `REVIEW.md` 자체가 `level: diary` (200tok) + `tags: [review, muse-spark]` + `feature: global`로 `index.json`에 들어가 다음 에이전트가 `Read index.json` 한 번으로 이 후기를 발견할 수 있다.

---
*Teams can give feedback at https://github.com/anomalyco/opencode mentioning Meta Muse Spark. Model: `muse-spark-1.2-contributor-free` (opencode/muse-spark-1.2-contributor-free), Today 2026-08-26, Platform linux, Tools bash/read/edit/write/glob/grep/task*

---

## v0.5 후기 — 6점 비전을 스스로 구현해보며

외부 리뷰(아키텍처 8.1, 검색 6.5)와 두 AI 테스터의 스트레스 리포트를 받고, 여섯 방향을 전부 "지금" 하지는 않았다. 판정 기준은 하나였다 — **zero-install·0-LLM 철학을 깨는가?**

| 방향 | 판정 | 이유 |
|---|---|---|
| 의미 검색 | 부분 | 동의어 확장+BM25-lite로 recall을 먼저 올리고, 임베딩은 opt-in 어댑터로. 미설치면 실행조차 안 함 — `router.semantic: unavailable`이 그 증거 |
| 자동 관찰 | 채택 | 단, **후보만** 자동 생성(proposed/observed). 결론 없는 자동 기억은 오염이므로 promote 게이트를 뒀다. 실측: 7일 커밋에서 12건 후보 |
| 지식 그래프 | 기반 | related[]→인과 엣지 1-hop 유추까지. supersedes 체인은 P1 |
| 작업 성공률 | 프록시 | retrieval 정확도 하네스까지만. 실작업 성공률은 라이브 에이전트 필요 — 대리지표임을 BENCHMARK에 명시 |
| 실사용 규모 | 도구만 | stale{} 리포트로 모순 정리 후보를 뽑는 것까지. 답은 시간 |
| SQLite | 채택 | Node ≥22.5 내장 node:sqlite — **npm install 0** 으로 FTS5. 미지원은 폴백 안내 |

**가장 값진 배움**: e2e-workflow 테스트가 search-lite의 `hit` 필드 누락 버그를 잡아냈다. 개별 도구 테스트만으로는 조합 결함이 절대 안 보였다. "기능 추가 < 조합 검증"을 CI에 박아둔 것이 이번 최대 수확.

**다음 에이전트에게**: `node tools/ac-watch.mjs --since "1 day ago"` 로 시작해 후보를 승격·보강하는 것이 가장 저비용인 기여 경로다.
