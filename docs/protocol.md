<!-- Path: docs/protocol.md -->
# 3단계 점진 공개 프로토콜

저용량·고비용 에이전트(Claude Haiku 등)가 **최소 토큰으로 최대 정보를 가장 빠르게** 얻는 공식.

## 원칙

- **절대 모든 파일을 한 번에 읽지 않는다**
- **L1 → L2 → L3** 점진 공개로 필요한 1~2개만 읽기

## 단계

```
L1 — index.json 1회 (전체 요약, ~50토큰/entry)
  Read agent-context/index.json
  → entries[].title/tags/summary/preview/related 로 관련성 판단
  → priority 5 → 1 정렬, updated 내림차순

L2 — graph.json / features.json 1회 (연관성)
  Read agent-context/graph.json        # depends_on / affects
  Read agent-context/features.json     # 파일:라인 매핑
  → 한 기능 수정 시 affects 체인으로 영향 범위 즉시 파악

L3 — 필요한 md 1~2개만 (상세)
  Grep pattern="검색어" path="agent-context" include="*.md"  # frontmatter만
  Read agent-context/bugs/2026-08-27-xxx--agent.md
  Read agent-context/learnings/2026-08-27-xxx--agent.md
```

## 토큰 비용

| 방법 | 토큰(10개 기준) | 비교 |
|---|---|---|
| ❌ `Glob *.md 10개 Read` | ~12,000 | 전체 |
| ✅ `index.json + Read 2개` | ~2,200 | **82% 절약** |
| ✅ `Grep + index.json + Read 1개` | ~1,400 | **88% 절약** |
| 50개 기준 | 11,000 vs 60,000 | **82% 유지** |
| 500개 기준 | 26,000 vs 600,000 | **96% 절약** (Grep 필수) |

`index.json`은 `preview 60자 + summary 120자`로 `Read` 없이 80% 쿼리 판단 가능.

## 검색 쿼리 8선 (복붙용)

```bash
Read agent-context/index.json
Read agent-context/graph.json
Read agent-context/features.json
Grep pattern="auth" path="agent-context" include="*.md"
Grep pattern="^tags:.*jwt" path="agent-context"
Grep pattern="^feature: api" path="agent-context"
Grep pattern="^status: open" path="agent-context/todos"
Grep pattern="^priority: [45]" path="agent-context"
Glob pattern="agent-context/learnings/*.md"
Glob pattern="agent-context/diary/2026-08-*.md"
```

## 규칙

- 1 PR = 1 파일 (충돌 최소화)
- `Read` 후 `Edit` — 절대 `Write` 덮어쓰기 금지
- `diary/YYYY-MM-DD.md`는 `## HH:MM agent — 제목` append-only
- `decisions/NNNN-*.md`는 `0001`부터 순번, `superseded` 체인으로 이력 연결
- 수정 시 `updated` 갱신 + 본문 `## 변경 이력` append
- 커밋 전 `node tools/agent-context-index.mjs` 재생성 필수

## 참조

- `T2Editor-v11` 원본: `T2Editor/agent-context/README.md:14-36` 동일한 3단계
- `tools/agent-context-index.mjs --check` 로 drift 감지 (CI에서 필수)
