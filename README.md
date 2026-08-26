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
agent-context.config.json          # 단일 설정 원천 (live 포함)
agent-context/
 ├─ index.json                     # L1 — 50토큰/entry, preview 60자+summary 120자
 ├─ graph.json                     # L2 — depends_on/affects/edges
 ├─ features.json                  # L2 — label/files/description
 ├─ schema.json                    # frontmatter JSON Schema (draft-07)
 ├─ README.md                      # 프로젝트별 진입점 (템플릿)
 ├─ notes/  ideas/  learnings/  bugs/  decisions/  diary/  todos/  code-history/  archive/
 ├─ sessions/                      # LIVE — sessions.json + inbox/<name>.jsonl (Claude file inbox)
 │  └─ inbox/                      # per-session file inbox (Unix socket 대체)
 └─ radio/                         # LIVE — threads/<name>.json (AgentRadio file threads)
    └─ threads/                    # create_thread / send_message / wait_for_mention
tools/
 ├─ agent-context-index.mjs        # --init/--check/--to-sqlite, config-aware
 ├─ agent-context-validate.mjs     # frontmatter lint
 ├─ agent-context-init.mjs         # npx 진입점
 ├─ agent-sessions.mjs             # LIVE — Claude reverse-engineered ListAgents/SendMessage
 └─ agent-radio.mjs                # LIVE — AgentRadio passive awareness (Apache 2.0)
templates/frontmatter/             # learning/bug/decision/diary 템플릿
docs/                              # protocol/schema/storage/agent-environment/radio/sessions
.claude/skills/agent-shared-context/ # Claude Code skill
skills/agent-shared-context/      # OpenCode/Codex skill
REFERENCES.md                      # AgentRadio + Claude attribution (Apache 2.0)
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

## Live — Sessions & Radio (NEW, AgentRadio + Claude reverse-engineered)

**Persistent** (`index.json` git) + **Live** (file inbox/radio, no server) 두 축으로 업그레이드:

- **Live sessions** (Claude `v2.1.224` cross-session reverse-engineered, file-based): `agent-context/sessions/sessions.json` + `sessions/inbox/<name>.jsonl` (Unix socket 대체, same-machine file never traverses servers)
  ```bash
  node tools/agent-sessions.mjs register my-session
  node tools/agent-sessions.mjs list                              # ListAgents
  node tools/agent-sessions.mjs send other "API moved" --from my # SendMessage plain text only, respects crossSessionInbound accept/hold/refuse + isolatePeerMachines + rateLimit/dedup
  node tools/agent-sessions.mjs inbox my-session
  node tools/agent-sessions.mjs wait my-session --timeout 30000   # wait_for_mention + full snapshot
  ```

- **Live radio** (AgentRadio `Coral-Protocol/AgentRadio` Apache 2.0, passive awareness): `agent-context/radio/threads/<name>.json` + `sessions/inbox/` for background watcher
  ```bash
  node tools/agent-radio.mjs create-thread planning "claude,codex"
  node tools/agent-radio.mjs send planning "found JWT race @codex" --mention @codex
  node tools/agent-radio.mjs wait codex --timeout 30000   # background task, no turn stolen (L3) vs blocking receive (L2)
  node tools/agent-radio.mjs protocol  # P1 Explore → P2 Divide → P3 Execute → P4 Review → P5 Submit (assembler gates)
  ```

- **파일 기반**: no `coral-server.jar`, no Docker/Modal/Harbor, no Claude Code binary, no Anthropic servers for same-machine — `agent-shared-context`는 범용 `file` inbox로 재구현. 상세는 `docs/radio.md` `docs/sessions.md` `REFERENCES.md` (참고한 부분 명시, Apache 2.0).

## Skill — Claude/Codex/OpenCode 표준

```bash
# Claude Code
cp -r .claude/skills/agent-shared-context ~/.claude/skills/  # or auto-discovered from repo
# OpenCode / Codex
cp -r skills/agent-shared-context ~/.config/opencode/skills/
cp -r skills/agent-shared-context ~/.codex/skills/
```

- **`.claude/skills/agent-shared-context/SKILL.md`** — Claude Code skill ( `name: agent-shared-context` `allowed-tools: Read,Grep,Glob,Bash(node tools/*)` ), 3-step protocol + live sessions/radio + five-phase protocol
- **`skills/agent-shared-context/SKILL.md`** — OpenCode/Codex generic skill (same content, standard `name/description` frontmatter)
- 설치 후 Claude/Codex/OpenCode 모두 `Read agent-context/index.json` → `Grep` → `Read md 1~2` + `node tools/agent-sessions.mjs send` / `node tools/agent-radio.mjs send` 로 동일한 프로토콜로 협업. 상세는 `docs/skill.md` (또는 skill 파일 자체).

## 검증

```bash
node tools/agent-context-validate.mjs
node tools/agent-context-index.mjs --check
node tools/agent-sessions.mjs list
node tools/agent-radio.mjs list-threads
find agent-context -name "*.json" | xargs -I {} node -e "JSON.parse(require('fs').readFileSync('{}','utf8'))"
```

CI는 `.github/workflows/ci.yml`에서 이 5종(validate+index+sessions+radio+skill) 중 3종을 수행 (경량 gate), 로컬에서 5종 모두 확인 가능.

## References & Attribution

- **AgentRadio**: `Coral-Protocol/AgentRadio` (Apache 2.0, `arXiv:2607.28430`) — three primitives `create_thread`/`send_message`/`wait_for_mention`, five-phase `P1-P5`, passive awareness background vs blocking receive, no harness modification, no extra LLM calls — **참고한 부분**: `tools/agent-radio.mjs` `docs/radio.md`에 file-based로 재구현, `coral-server.jar` 등은 미복사. See `REFERENCES.md`.
- **Claude sessions**: https://code.claude.com/docs/en/cross-session-messaging `v2.1.224` + Apache open-source reconstructions `LING71671/Open-ClaudeCode` `C293943/claude-code-open` `montisan/claude-code-source-code` `anthropics/claude-code` PR #41447 (Apache 2.0) — `ListAgents`/`SendMessage`/per-session socket/inbox/`crossSessionInbound`/`isolatePeerMachines`/plain text/rateLimit — **리버스 엔지니어링** 후 `tools/agent-sessions.mjs` `docs/sessions.md`에 file-based `sessions/inbox/*.jsonl`로 재구현, `cli.js` 미복사. See `REFERENCES.md`.
- 전체 목록은 `REFERENCES.md`에 Apache 2.0 준수 귀속 고지와 함께 명시.

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
