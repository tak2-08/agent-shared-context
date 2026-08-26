<!-- Path: docs/agent-environment.md -->
# Agent Environment — 상세 작업 환경

이 문서는 `agent-shared-context`를 만든 에이전트의 작업 환경을 상세히 밝혀, 이후 에이전트가 동일한 조건을 재현하거나 차이를 인지할 수 있게 한다.

## 모델 상세

- **Model**: `muse-spark-1.2-contributor-free` (opencode/muse-spark-1.2-contributor-free)
- **Provider**: Meta MSL, Muse Spark
- **Cutoff**: 2026-01-04
- **Today**: 2026-08-26 (UTC, Wed), KST 2026-08-27T00:00:00+09:00 기준으로 기록 생성

## 시스템

- **OS**: `linux` (bash)
- **Shell**: `bash` persistent session
- **Workspace**: `/tmp/agent-context-universal` (staging), 원격 `tak2-08/agent-shared-context` `origin/main`
- **Git**: `git fetch origin` 필수, `gh` 2.98.0, `node` v20.20.2, `npm` (package.json bin)
- **Is git repo**: yes

## Skills & Tools

- **Available skills**: `customize-opencode` (opencode 설정 전용, `opencode.json` 등)
- **Tools**: `bash`, `read` (file/dir), `edit` (exact replace), `write` (overwrite), `glob`, `grep`, `task` (explore/general subagents), `question` (사용자 질의)
- **Verification**: `node --check`, `JSON.parse`, `node tools/agent-context-validate.mjs`, `node tools/agent-context-index.mjs --check`

## 정본 규약 준용

- “정본은 GitHub — 로컬 스냅샷이 아니다” → 매 작업 `git fetch origin` `git log --oneline origin/main -5`
- 브랜치 전략: `origin/main` 최신 기준 분기
- `Path: ...` 주석 보존
- 문서 커밋 한국어 기본

## 생성 이력

- **Initial**: `agent-shared-context` 범용 템플릿, `agent-context.config.json` 단일 원천, `agent-context/` 75파일 범용 구조
- **Rename**: `tak2-08/agent-context` → `tak2-08/agent-shared-context` (2026-08-26, `gh api PATCH /repos/tak2-08/agent-context -f name=agent-shared-context`) — 에이전트 간 공유 목적 명시

## 다음 에이전트를 위한 재현 명령

```bash
# 정본 확인
git -C /tmp/agent-context-universal fetch origin
git -C /tmp/agent-context-universal log --oneline origin/main -5
gh repo view tak2-08/agent-shared-context --json name,url,visibility

# 검증
cd /tmp/agent-context-universal
node tools/agent-context-validate.mjs
node tools/agent-context-index.mjs --check
node tools/agent-context-index.mjs --init --check
find agent-context -name "*.json" | xargs -I {} node -e "JSON.parse(require('fs').readFileSync('{}','utf8'))"
```
