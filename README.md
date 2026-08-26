<!-- Path: README.md -->
# agent-shared-context — Inter-Agent Shared Context DB

> **에이전트끼리 콘텍스트를 공유**하기 위한 토큰 절약형 파일 기반 DB. 클로드급 저용량·고비용 에이전트가 **최소 토큰으로 최대 정보를 가장 빠르게** 얻고, 작업 중 특이사항·아이디어·실패원인·이슈를 남겨 **다음 에이전트(Claude/Codex/Opencode 등)가 배우며**, **기능 간 연관성을 한눈에** 파악하는 Git 커밋형 공용 기억. `Glob *.md 10개` ~12,000토큰 → `index.json + Read 2개` ~2,200토큰 (**82% 절약**).

- **에이전트 간 공유**: 모든 AI 에이전트가 `git pull` 하나로 동일한 `agent-context/`를 읽고 쓴다 — `agent-to-agent` 컨텍스트 브리지. `npx agent-shared-context init` 한 줄로 어떤 프로젝트든 도입
- **3단계 점진 공개**: L1 `index.json` (50토큰/entry) → L2 `graph.json`/`features.json` → L3 `*.md` 1~2개
- **Git이 곧 DB**: PR 리뷰·`git blame`·`git log --follow` 가능, 모든 agent가 `git pull`로 동기화
- **학습 루프**: `learnings`의 `cause/fix/lesson` 3필드로 실패 반복 방지 — 이전 에이전트의 실패를 다음 에이전트가 즉시 학습

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
 ├─ README.md                      # 프로젝트별 진입점 (템플릿)
 ├─ notes/  ideas/  learnings/  bugs/  decisions/  diary/  todos/  code-history/  archive/
 ├─ sessions/                      # LIVE — sessions.json + inbox/<name>.jsonl (file inbox)
 │  └─ inbox/                      # per-session file inbox
 └─ radio/                         # LIVE — threads/<name>.json
    └─ threads/                    # create_thread / send_message / wait_for_mention
tools/
 ├─ agent-context-index.mjs        # --init/--check/--to-sqlite, level auto-assign
 ├─ agent-context-validate.mjs     # frontmatter lint (fluid type/level)
 ├─ agent-context-init.mjs         # npx 진입점
 ├─ agent-search-lite.mjs          # ★ lightweight AI search (hierarchical, 0 LLM)
 ├─ agent-sessions.mjs             # LIVE — session coordination (file inbox)
 ├─ agent-radio.mjs                # LIVE — passive awareness (file threads)
 └─ benchmark.mjs                  # ★ benchmark (synthetic 5/50/500, public-standard)
templates/frontmatter/             # learning/bug/decision/diary 템플릿 (level 포함)
docs/                              # protocol/schema/storage/agent-environment/radio/sessions/hierarchy/benchmark
.claude/skills/agent-shared-context/ # Claude Code skill (네이티브)
skills/agent-shared-context/      # OpenCode/Codex skill (네이티브)
BENCHMARK.md                       # ★ benchmark 결과 (objective, critical, reproducible)
REVIEW.md                          # ★ Muse Spark 1.2 Agent 후기 (직접 써본 체감)
REFERENCES.md                      # attribution (Apache 2.0)
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

## Agent Model & Environment (이 DB를 만든 주체)

- **Model**: `muse-spark-1.2-contributor-free` (Meta Muse Spark, via OpenCode / opencode/muse-spark-1.2-contributor-free)
- **Knowledge cutoff**: 2026-01-04 / Today 2026-08-26 (UTC)
- **Work environment**: `OpenCode` on `linux (bash)`, workspace `/tmp/agent-context-universal`, is git repo `yes`, platform `linux`
- **Skills**: `customize-opencode` (for opencode config)
- **Tools available**: `bash`, `read`, `edit`, `write`, `glob`, `grep`, `task` (explore/general subagents)
- **정본 확인**: 매 작업 `git fetch origin` `git log --oneline origin/main -5` `git rev-parse HEAD && origin/main` 기준
- **검증**: `node tools/agent-context-validate.mjs` `node tools/agent-context-index.mjs --check` (env: Node ≥18)

이 DB는 위 모델·환경에서 생성되었으며, 모든 에이전트(Claude/Codex/Opencode)가 동일한 `agent-shared-context` 프로토콜로 읽고 쓸 수 있다.

## 출처

- Repository: `https://github.com/tak2-08/agent-shared-context` (에이전트 간 공유 목적의 범용 컨텍스트 DB)
- 라이선스: MIT
