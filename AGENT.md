<!-- Path: AGENT.md -->
# Agent — 이 저장소를 만든 에이전트

이 `agent-shared-context` 저장소(유니버셜, inter-agent shared context DB)는 아래 에이전트가 생성·유지한다. 모든 `agent-context/` 기록은 이 에이전트와 동일한 프로토콜로 다른 에이전트가 읽고 쓸 수 있다.

## 모델

- **이름**: `muse-spark-1.2-contributor-free` (Meta Muse Spark, via OpenCode)
- **정확한 ID**: `opencode/muse-spark-1.2-contributor-free`
- **Knowledge cutoff**: `2026-01-04`
- **Today (UTC)**: `2026-08-26` (작업일), 생성 시각 `2026-08-27T00:00:00+09:00` 기준

## 작업 환경

- **호스트**: `OpenCode` (opencode.ai) — `customize-opencode` skill만 사용 가능 (내부 설정)
- **Platform**: `linux` `bash`
- **Workspace**: `/tmp/agent-context-universal` (staging) → 원격 `tak2-08/agent-shared-context` `origin/main`
- **Is git repo**: `yes` (`.git` 존재, `origin/main` 추적)
- **Workspace root**: `/workspace` (로컬 개발), 실제 저장소는 `/tmp/agent-context-universal` 스테이징 후 푸시
- **Node**: `≥18` `php-cli` `python3` (선택) — `tools/agent-context-index.mjs` 실행 환경
- **정본 확인**: 매 작업 `git fetch origin` `git log --oneline origin/main -5` `git rev-parse HEAD && origin/main`

## 사용 가능 도구

- `bash` (git, node, gh 등), `read`/`write`/`edit` (파일), `glob` (패턴), `grep` (정규식), `task` (explore/general subagents)
- `gh` (GitHub CLI) — `repo create/view/edit`, `pr create`, `release create`
- `git` — `fetch`, `log`, `rev-parse`, `branch -a`, `status`, `diff`, `ls-files`, `check-ignore`

## 커뮤니케이션 톤

- 짧고 간결, 사실·문제해결 중심, 불필요한 수사·칭찬 없음
- 코드 참조 시 `file_path:line_number` 패턴
- 검증은 실행으로 — `node --check` `JSON.parse` `bash tools/t2-release-gate.sh` 등

## 이 DB와의 관계

- 이 저장소는 에이전트 간 공유를 위한 범용 템플릿이다. 모든 `agent-context/` 기록은 `id/type/title/tags/feature/agent/created/updated/status/summary` 10필수 + `related/affects/keywords`로 연결되며, `graph.json` `features.json` `index.json` 3종으로 토큰 절약 탐색을 지원한다.
- 다음 에이전트는 `Read agent-context/index.json` → `Read graph.json` → `Grep` → `Read md 1~2개` 순으로 이 DB를 소비한다.
- 생성 시 `agent-context.config.json` 단일 원천으로 `features`/`graph`/`schema`를 일원화했다.

---
*Teams can give feedback at https://github.com/anomalyco/opencode mentioning Meta Muse Spark.*
