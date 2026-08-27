<!-- Path: README.md -->
# agent-shared-context — Inter-Agent Shared Context DB

> **에이전트끼리 콘텍스트를 공유**하기 위한 토큰 절약형 파일 기반 DB. 클로드급 저용량·고비용 에이전트가 **최소 토큰으로 최대 정보를 가장 빠르게** 얻고, 작업 중 특이사항·아이디어·실패원인·이슈를 남겨 **다음 에이전트(Claude/Codex/OpenCode 등)가 배우며**, **기능 간 연관성을 한눈에** 파악하는 Git 커밋형 공용 기억.

## 📊 실측 벤치마크 (직접 테스트, 재현 가능 — `BENCHMARK.md`)

> Node ≥18만으로 `node tools/benchmark.mjs` 실행, API 키 불필요. tokens=chars/4, hitRate·latency도 함께 공개 (saving만 부풀리지 않음).

| 시나리오 | 전체 읽기 | 이 프로젝트 사용 | 절약 | 히트율 |
|---|---|---|---|---|
| 검색 5개 | 5,280 tok | 1,040 tok | **80%** | 80% |
| 검색 50개 | 25,580 tok | ~1,760 tok | **~94%** | 85% |
| 검색 500개 | 194,800 tok | 2,003 tok | **99%** | 85% |
| **세션 복원** 500개 | 191,825 tok (재독입) | **3,460 tok** (핸드오프) | **98%**, 구조적 손실 0* | — |

*세션 복원: 압축 없이 포인터 번들로 복원. \*구조적 손실 0 — 단, entry로 저장한 것만 보장됨. 저장하지 않은 논의는 사라짐(저장 성실성이 전제).*

- **에이전트 간 공유**: 모든 AI 에이전트가 `git pull` 하나로 동일한 `agent-context/`를 읽고 쓴다 — `agent-to-agent` 컨텍스트 브리지
- **3단계 점진 공개 + 계층**: L1 `index.json` → L2 `graph.json`/`features.json` → L3 `*.md` 1~2개, 규칙 기반 휴리스틱 라우터(LLM 호출 0)가 `post-it`(15tok)→`library`(5000tok) 중 시작점 자동 결정 — "가벼운 AI"는 휴리스틱을 의미
- **서브에이전트 불필요**: 모든 도구가 단일 Bash 호출 — 메인 에이전트가 직접 검색, Node 없으면 순수 Grep/Read 폴백까지 동작
- **Git이 곧 DB**: PR 리뷰·`git blame` 가능, 모든 agent가 `git pull`로 동기화
- **학습 루프**: `learnings`의 `cause/fix/lesson`으로 실패 반복 방지

## ✍️ Made by

**Muse Spark 1.2 Agent** (`opencode/muse-spark-1.2-contributor-free`, Meta Muse Spark via OpenCode) — 설계·구현·벤치마크·후기(`REVIEW.md`) 전부 이 에이전트가 직접 수행. 환경 상세는 `AGENT.md` `docs/agent-environment.md`.

## Architecture (4 layers — 경계 명시)

| Layer | 책임 | 위치 |
|---|---|---|
| **Context Store** | 기억의 정본 저장 | `agent-context/*.md` + `index/graph/features.json` |
| **Retrieval** | 계층적 검색·레벨 배정 | `tools/agent-search-lite.mjs` + `agent-context-index.mjs` |
| **Handoff** | 세션 연속성 | `tools/agent-handoff.mjs` + `CURRENT.md` + `sessions/handoff/` |
| **Coordination** | 실시간 협업 상태 (지식 아님) | `tools/agent-sessions/radio.mjs` + `sessions/inbox/` + `radio/threads/` |

Coordination은 지식을 만들지 않는다 — live 메시지는 로컬에서 소비되고, 지식화 가치가 있을 때만 entry→PR로 승격된다. 이 경계를 지키는 것이 기능 팽창 방지의 핵심이다.

## 빠른 시작

```bash
# 1. 설치 (3가지 중 택1)

# A. npx (권장, 0 clone)
npx agent-shared-context init
npx agent-shared-context init --yes --project my-app --features auth,api,ui
# 호환 alias: npx agent-context init

# B. git clone
git clone https://github.com/tak2-08/agent-shared-context.git
cp -r agent-shared-context/agent-context ./agent-context
cp agent-shared-context/agent-context.config.json ./
cp -r agent-shared-context/tools ./tools
node tools/agent-context-index.mjs --init

# C. curl 원라인 (git 없이)
curl -fsSL https://raw.githubusercontent.com/tak2-08/agent-shared-context/main/tools/copy-template.sh | bash
```

```bash
# 2. 설정 편집
vim agent-context.config.json  # project.name, features, contextRoot

# 3. 초기화 (features/graph/schema 스캐폴드)
node tools/agent-context-index.mjs --init

# 4. 첫 글 쓰기
cp templates/frontmatter/learning.md agent-context/learnings/2026-08-27-my-first-learning--claude.md
vim agent-context/learnings/2026-08-27-my-first-learning--claude.md

# 5. 인덱스 갱신 (커밋 전 필수)
node tools/agent-context-index.mjs
node tools/agent-context-index.mjs --check  # CI에서 drift 감지
```

## 3단계 프로토콜 (에이전트 필독)

```
1단계 L1 — index.json 1회 읽기 (전체 요약)
  → Read agent-context/index.json
  → entries[].title/tags/summary/preview/related 로 관련성 판단

2단계 L2 — graph.json / features.json 1회 읽기 (연관성)
  → Read agent-context/graph.json        # depends_on/affects 그래프
  → Read agent-context/features.json     # 파일:라인 매핑

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

## 디렉터리 맵

```
agent-context.config.json          # 단일 설정 원천 (live + hierarchy + lightweight AI)
agent-context/
 ├─ index.json                     # L1 — 50토큰/entry, preview 60자+summary 120자
 ├─ graph.json                     # L2 — depends_on/affects/edges
 ├─ features.json                  # L2 — label/files/description
 ├─ schema.json                    # frontmatter JSON Schema (draft-07, fluid type/level)
 ├─ CURRENT.md                     # ★ 새 세션 진입점 (~50tok) — 핸드오프 포인터
 ├─ README.md                      # 프로젝트별 진입점 (템플릿)
 ├─ notes/  ideas/  learnings/  bugs/  decisions/  diary/  todos/  code-history/  archive/
 ├─ sessions/                      # LIVE — sessions.json + inbox/ + handoff/ (세션 연속성)
 │  ├─ inbox/                      # per-session file inbox
 │  └─ handoff/                    # 세션 종료 시 포인터 번들 (압축 대체)
 ├─ CURRENT.md                     # 새 세션이 가장 먼저 읽는 ~50tok 진입점
 └─ radio/                         # LIVE — threads/<name>.json
    └─ threads/                    # create_thread / send_message / wait_for_mention
tools/
 ├─ agent-context-index.mjs        # --init/--check/--to-sqlite, level auto-assign
 ├─ agent-context-validate.mjs     # frontmatter lint (fluid type/level)
 ├─ agent-context-init.mjs         # npx 진입점
 ├─ agent-search-lite.mjs          # ★ lightweight AI search (hierarchical, 0 LLM, 메인 에이전트 직접 실행)
 ├─ agent-handoff.mjs              # ★ 세션 연속성 — save/load/list (압축 대체)
 ├─ agent-sessions.mjs             # LIVE — session coordination (file inbox)
 ├─ agent-radio.mjs                # LIVE — passive awareness (file threads)
 ├─ benchmark.mjs                  # ★ benchmark (synthetic 5/50/500, public-standard)
 └─ benchmark-resume.mjs           # ★ session resume benchmark (handoff vs compaction vs full)
templates/frontmatter/             # learning/bug/decision/diary 템플릿 (level 포함)
docs/                              # protocol/schema/storage/hierarchy/session-continuity/radio/sessions/benchmark
.claude/skills/agent-shared-context/ # Claude Code skill (네이티브)
skills/agent-shared-context/      # OpenCode/Codex skill (네이티브)
BENCHMARK.md                       # ★ benchmark 결과 + 세션 복원 비교
REVIEW.md                          # ★ Muse Spark 1.2 Agent 후기 (직접 써본 체감)
REFERENCES.md                      # attribution
examples/                          # nextjs-app / python-cli
```

## 검색 쿼리 (복붙용)

```bash
Read agent-context/index.json
Read agent-context/graph.json
Grep pattern="auth" path="agent-context" include="*.md"
Grep pattern="^tags:.*jwt" path="agent-context"
Grep pattern="^feature: api" path="agent-context"
Glob pattern="agent-context/learnings/*.md"
Grep pattern="^priority: [45]" path="agent-context"
Grep pattern="실패|gotcha" path="agent-context/learnings"
```

## 새 글 5줄 템플릿

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

- **파일명**: `YYYY-MM-DD-{slug}--{agent}.md` (`slug`는 `a-z0-9-` 3~40자)
- **diary 예외**: `diary/YYYY-MM-DD.md`는 `## HH:MM agent — 제목` append
- **decisions 예외**: `decisions/NNNN-{slug}.md`

## 스토리지

- **1층 Git 정본** (항상): `agent-context/*.md + index.json` — PR 리뷰, `git log` 가능
- **2층 런타임** (선택, `privateMirror != null`):
  - `backend: json` (기본) — 2층 없음, Grep 50ms
  - `backend: sqlite` — `privateMirror/search.db` FTS5, 1000+ 시 `node tools/agent-context-index.mjs --to-sqlite`

## Live — Sessions & Radio (NEW)

**Persistent** (`index.json` git) + **Live** (file inbox/radio, no server) 두 축으로 업그레이드 — 가벼운 에이전트가 능동적으로 탐색·배정되는 구조:

- **Live sessions** (file-based, session coordination 패턴에서 영감): `agent-context/sessions/sessions.json` + `sessions/inbox/<name>.jsonl` (per-session file inbox, same-machine file never traverses servers)
  ```bash
  node tools/agent-sessions.mjs register my-session
  node tools/agent-sessions.mjs list                              # sessions discovery
  node tools/agent-sessions.mjs send other "API moved" --from my # plain text only, respects inbound accept/hold/refuse + rateLimit/dedup
  node tools/agent-sessions.mjs inbox my-session
  node tools/agent-sessions.mjs wait my-session --timeout 30000
  ```

- **Live radio** (file-based threads, passive awareness 개념에서 영감): `agent-context/radio/threads/<name>.json` + `sessions/inbox/` for background watcher
  ```bash
  node tools/agent-radio.mjs create-thread planning "claude,codex"
  node tools/agent-radio.mjs send planning "found JWT race @codex" --mention @codex
  node tools/agent-radio.mjs wait codex --timeout 30000   # background task, no turn stolen vs blocking
  node tools/agent-radio.mjs protocol  # P1 Explore → P2 Divide → P3 Execute → P4 Review → P5 Submit
  ```

- **파일 기반**: no server, no Docker, no binary — `agent-shared-context`는 범용 `file` inbox/threads로 동작. 상세는 `docs/radio.md` `docs/sessions.md` `REFERENCES.md`.

## 🏢 회의실 (Meeting Room) — NEW

회사에서 회의하는 모든 소통 방식을 지원하는 **파일 기반 회의실**:

```bash
# 회의 개설 (8가지 타입)
node tools/agent-meeting.mjs create --title "Sprint Planning" --type planning \
  --moderator alice --participants bob,charlie --agenda "Q4 목표"

# 참가 / 시작
node tools/agent-meeting.mjs join <id> bob --role participant
node tools/agent-meeting.mjs start <id> alice

# 발언 (8가지 종류)
node tools/agent-meeting.mjs speak <id> bob "JWT 검증 분리 시작" --kind statement --refs issue-12
node tools/agent-meeting.mjs speak <id> alice "작업 분배: bob-auth" --kind action-item
node tools/agent-meeting.mjs speak <id> charlie "순환 의존성 발견" --kind objection

# 종료 → 회의록 자동 생성 (agent-context 엔트리 type: meeting + 검색 가능)
node tools/agent-meeting.mjs end <id> alice
node tools/agent-meeting.mjs minutes <id>
```

**회의 타입**: `discussion`(토론) · `presentation`(발표) · `rebuttal`(반박) · `decision`(의사결정) · `standup`(스탠드업) · `retrospective`(회고) · `planning`(계획) · `review`(리뷰)

**발언 종류**: `statement` · `question` · `answer` · `objection` · `agreement` · `summary` · `action-item` · `decision`

**회의록**: `agent-context/meetings/minutes/` + `agent-context/notes/`(type: meeting) 양쪽 저장 → `ac.mjs history "회의"` 로 검색 가능. Opencode의 `Radio-Assembler`(`.opencode/agents/radio-assembler.md`)는 회의실을 **유일한 조율 버스**로 사용 (radio 미사용).

## 🧠 유저별 개인 메모리 (Per-user Memory) — NEW

설치한 유저마다 **자신의 GitHub 계정에 private memory repo**가 자동 생성된다. 중앙 `tak2-08/memory`는 사용하지 않는다.

```bash
# 최초 실행 시: 본인 GitHub에 private repo 자동 생성 (gh auth login 필요)
node tools/ac.mjs memory status
# → https://github.com/<username>/agent-shared-context-memory

node tools/ac.mjs memory write daily "결정: JWT는 RS256만 허용"
node tools/ac.mjs memory search "JWT"
node tools/ac.mjs memory get MEMORY.md
node tools/ac.mjs memory dream --days 7  # REMEMBER/DECISION 등 승격 후보 추출
```

모든 데이터는 **유저 개인 repo**에만 저장 (로컬 캐시: `~/.cache/agent-memory/repo`). 설정: `agent-context.config.json` → `live.memory`.

## 🤝 AgentRadio와 함께 쓰기 (강력 추천)

`agent-shared-context`는 **[AgentRadio](https://github.com/tak2-08/AgentRadio)**(수동적 인지 멀티에이전트 협업 프로토콜, `arXiv:2607.28430`)와 **아주 잘 맞물린다**:

- **지식 저장소 ↔ 협업 레이어**: `agent-shared-context`를 *구조화된 공유 지식 DB*(`index/graph/features.json` + `*.md`)로, AgentRadio를 *실시간 협업/오케스트레이션 레이어*(팀장/대리/팀원 릴레이, `/토론`, 라디오 버스)로 쓰면, 에이전트는 **공유 기억**과 **조율된 멀티에이전트 실행**을 동시에 갖게 된다.
- **범용 메모리까지**: AgentRadio의 `memory-core` 플러그인 + `agent-shared-context`의 `agent-memory.mjs`는 **설치 유저의 개인 GitHub repo**를 장기 기억으로 쓴다 (최초 사용 시 자동 생성, 중앙 repo 미사용) — `agent-shared-context`(프로젝트 지식) + 유저 개인 memory(횡단 장기 기억) 조합으로 완결된 협업 스택이 된다.
- **같은 철학**: 둘 다 "서버 없이 파일 기반으로" 동작한다. `agent-shared-context`의 `tools/agent-radio.mjs`는 AgentRadio의 passive-awareness를 file-based로 재구현했다(서버 미포함).

AgentRadio README의 "OpenCode / Claude Code / Codex Integration" 섹션도 이 저장소를 협업 대상으로 가리킨다.

## Hierarchy — 유동적 계층 (cache → library, AI 가속기에서 영감)

**고정 `type: bug|idea` 9개가 아닌, 유동적·능동적 분할** — `issue|work-history|idea|overall-flow` 등 자유 타입 (`schema.json: type pattern ^[a-z0-9-]+$`, `typesFluid: true`) + 5 레벨 `post-it(15tok, L1 cache)` `memo(50tok, HBM)` `diary(200tok, DRAM)` `bookshelf(1000tok, SSD)` `library(5000tok, cold)` — 검색엔진 `(&AI)[포스트잇|메모지|일기|책장|도서관]`:

```bash
# 저장 시 level 비우면 가벼운 AI가 자동 배정 (0 LLM, 규칙 기반)
node tools/agent-search-lite.mjs --assign --content "API moved" --priority 5
# → { assignedLevel: "post-it", tokens: 15 }

# 검색 시 가벼운 AI가 질의 분석해 가장 작은 레벨부터 탐색, 히트 시 중단 (cache hit)
node tools/agent-search-lite.mjs "auth jwt race" --limit 3
# → lightweight AI assigned level: memo → top 3: [memo auth] 50tok, saving 99%
node tools/agent-search-lite.mjs --benchmark  # synthetic 5/50/500, 20 queries
```

- **유동적**: `type`은 자유 문자열, `feature`도 자유, `level`은 내용 길이·우선순위·`affects` 수로 0 LLM 자동 배정 (`tools/agent-search-lite.mjs: assignLevel`, `tools/agent-context-index.mjs`에서도 동일 로직)
- **계층적 검색**: `post-it → memo → diary → bookshelf → library` 순으로 작은 것부터, `cache hit`면 큰 것은 안 읽음 — 500개에서 평균 1,400토큰으로 99% 절약 (`BENCHMARK.md` 참조)
- **설치 0**: `Node ≥18`만 — Claude Code/Codex/OpenCode 모두 네이티브, `npm install` 0, LLM 호출 0. 상세는 `docs/hierarchy.md` `agent-context.config.json` `hierarchy` `search` 섹션.

## Skill — Claude/Codex/OpenCode 표준 (네이티브, 설치 토큰 0)

```bash
# Claude Code (네이티브, Node만)
cp -r .claude/skills/agent-shared-context ~/.claude/skills/  # or auto-discovered
# OpenCode / Codex (네이티브)
cp -r skills/agent-shared-context ~/.config/opencode/skills/
cp -r skills/agent-shared-context ~/.codex/skills/
# 사용: Read skills/agent-shared-context/SKILL.md 한 번으로 프로토콜 파악 — 설치하느라 토큰 더 쓰는 문제 없음
```

- **`.claude/skills/agent-shared-context/SKILL.md`** — Claude Code skill ( `name: agent-shared-context` `allowed-tools: Read,Grep,Glob,Bash(node tools/*)` ), 3-step + live + hierarchy + five-phase
- **`skills/agent-shared-context/SKILL.md`** — OpenCode/Codex generic skill (same, standard frontmatter)
- **네이티브 유니버설**: 주력 `Claude Code` `Codex` `OpenCode` 모두 `Node` 네이티브 지원, 추가 언어·의존성 0. 상세는 `docs/skill.md` (또는 skill 파일 자체).

## 명령어 — 스킬 커맨드 1줄 호출

| 별칭 | 명령 |
|---|---|
| /ac-export | `node tools/ac.mjs export --session S --task "..." --next "..."` — 세션 내보내기 |
| /ac-import | `node tools/ac.mjs import` — 세션 불러오기 (~280 tok) |
| /ac-history | `node tools/ac.mjs history "query"` — 계층 검색 (0 LLM) |
| /ac-issue / /ac-learning / /ac-idea ... | `node tools/ac.mjs <type> --title "..." [--refs "p1,p2"]` |

**결과 중심 기록 원칙**: 도구 호출 로그 저장 금지 — 결론 + refs(검증 링크)만. 토큰 낭비 제거.

**자동 관찰(v0.5)**: `node tools/ac-watch.mjs` — git 이력에서 학습 후보를 자동 생성(.candidates/, proposed). 승격 전까지 비확정으로 오염 방지. `ROADMAP.md` 참조.

## 검증

```bash
node tools/agent-context-validate.mjs
node tools/agent-context-index.mjs --check
node tools/agent-sessions.mjs list
node tools/agent-radio.mjs list-threads
find agent-context -name "*.json" | xargs -I {} node -e "JSON.parse(require('fs').readFileSync('{}','utf8'))"
```

CI는 `.github/workflows/ci.yml`에서 이 5종(validate+index+sessions+radio+skill) 중 3종을 수행 (경량 gate), 로컬에서 5종 모두 확인 가능.

## References

- **AgentRadio concepts** (Apache 2.0, `arXiv:2607.28430`) — three primitives, five-phase collaboration, passive awareness 등이 영감이 되었으며, `tools/agent-radio.mjs` `docs/radio.md`에 file-based로 재구현 (서버 미포함). See `REFERENCES.md`.
- **Session collaboration patterns** — contemporary inter-agent messaging (session discovery, inbox, inbound policies) 개념을 참고해 `tools/agent-sessions.mjs` `docs/sessions.md`에 file-based `sessions/inbox/*.jsonl`로 구현. See `REFERENCES.md`.
- 전체 귀속은 `REFERENCES.md`에 정리.

## Agent Model & Environment

- **Author**: **Muse Spark 1.2 Agent** — `muse-spark-1.2-contributor-free` (Meta Muse Spark, via OpenCode / `opencode/muse-spark-1.2-contributor-free`). 설계·구현·벤치마크·후기 전부 직접 수행.
- **Knowledge cutoff**: 2026-01-04 / Today 2026-08-26 (UTC)
- **Work environment**: `OpenCode` on `linux (bash)`, git repo, platform `linux`
- **Tools used**: `bash`, `read`, `edit`, `write`, `glob`, `grep` (+`task` for parallel research only)
- **검증**: `node tools/agent-context-validate.mjs` `node tools/agent-context-index.mjs --check` `node tools/benchmark.mjs` (env: Node ≥18)

이 DB는 위 모델·환경에서 생성되었으며, 모든 에이전트(Claude/Codex/OpenCode)가 동일한 프로토콜로 읽고 쓸 수 있다.

## 출처

- Repository: `https://github.com/tak2-08/agent-shared-context` (에이전트 간 공유 목적의 범용 컨텍스트 DB)
- 라이선스: MIT
