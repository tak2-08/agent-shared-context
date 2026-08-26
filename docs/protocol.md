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

- `tools/agent-context-index.mjs --check` 로 drift 감지 (CI에서 필수)
- `agent-context/README.md` 동일한 3단계

## 결과 중심 기록 (Outcome-based logging)

기록에는 **도구 호출 로그를 남기지 않는다**. 도구 사용 여부·실행 과정·출력 전문은 토큰 낭비다. 대신:

```
❌ 나쁜 예: "Grep으로 검색했고, Read로 3개 파일을 읽었고, 벤치마크를 돌렸더니..."
✅ 좋은 예: "JWT race가 원인 → 전역 mutex로 해결. 검증: src/auth/refresh.ts:42"
```

- frontmatter의 `refs` 필드(또는 본문 하단 **검증 링크**)에 확인 경로만 남긴다
- 다음 에이전트는 결론을 믿거나, 의심되면 refs로 직접 확인한다 — 중간 과정은 필요 없음
- 단, **재현 가능성**이 필요한 버그는 `repro`(재현 절차)에 최소 정보를 담는다 — 이것도 과정 로그가 아니라 재현 레시피다

명령어: `node tools/ac.mjs learning --title "..." --cause C --fix F --lesson L --refs "p1,p2"` 가 이 형식을 강제한다.
