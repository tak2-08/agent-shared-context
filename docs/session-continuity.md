<!-- Path: docs/session-continuity.md -->
# Session Continuity — 압축 없이 세션을 이어가기

> **목표**: 컨텍스트 한도에 닿아 세션을 새로 열어도, **기존 기억 손실 최소 + 저토큰**으로 이어서 일한다. 핵심 원칙: **메모리는 채팅이 아니라 DB에 있다.**

## 왜 압축(compaction)을 대체하는가

압축은 대화를 요약하며 구조(결정 근거·원인·수정·다음 단계)를 흐린다. 요약본만으로는 "왜 그렇게 했는지"가 사라진다. `agent-shared-context`에서는 작업 중 중요한 것이 **즉시 entry로 저장**되므로(`post-it`~`library`), 세션이 끝나거나 압축되어도 DB에는 전부 남는다. 새 세션은 요약이 아니라 **포인터 번들**을 읽고, 필요한 심층만 온디맨드로 읽는다.

## 3단계 워크플로

### 1) 작업 중 — 버릴 것이 없게

발견·결정·실패가 생길 때마다 entry로 즉시 저장 (type 유동, level 자동):

```bash
# 한 줄 발견 → post-it
node tools/agent-search-lite.mjs --assign --content "API moved to /v2" --priority 5
# → agent-context/notes/... 에 저장 후 index 재생성
node tools/agent-context-index.mjs
```

### 2) 세션 종료 전 — 핸드오프 저장 (~280 tok)

```bash
node tools/agent-handoff.mjs save \
  --session my-session \
  --task "auth 리팩터링" \
  --done "JWT race 수정;테스트 3건 추가" \
  --next "refresh 엔드포인트 문서화;회귀 시험"
```

- `sessions/handoff/<date>--<session>.md` 생성 (task/done/key pointers/next)
- `agent-context/CURRENT.md` 포인터 갱신 (~50 tok) — **새 세션의 첫 Read**

### 3) 새 세션 복원 — ~600 tok, 손실 0

```bash
Read agent-context/CURRENT.md                 # ~50 tok
node tools/agent-handoff.mjs load             # ~280 tok — task/done/next
node tools/agent-search-lite.mjs "<query>"    # 필요한 심층만 (0 LLM)
Read <검색된 1~2 md>                           # 온디맨드
```

전체 히스토리 재독입도, 압축 요약 의존도 없음. 벤치마크: 500개 기준 full re-read 대비 **98.2% 절약**, 구조적 손실 0 (`BENCHMARK.md` Session resume 섹션).

## 서브에이전트·AI 배정 없이 동작 (메인 에이전트 직접 검색)

모든 도구는 **단일 Bash 호출**이다 — 서브에이전트 스폰 없음, 라우팅용 AI 호출 없음:

| 방법 | 조건 | 사용 |
|---|---|---|
| **search-lite** | Node ≥18 만 | `node tools/agent-search-lite.mjs "query"` — 규칙 기반, 메인 에이전트가 직접 실행 |
| **Grep/Read 폴백** | Node 없어도 OK | 아래 순수 레시피 |
| 서브에이전트 위임 | 선택 사항 | 필요 없음 — 있으면 병렬 탐색에만 활용 |

**순수 Grep/Read 폴백 (Node조차 불필요)**:

```bash
# 1) 포인터부터
Read agent-context/CURRENT.md
# 2) 지도
Read agent-context/index.json          # entries[].title/tags/summary/path
# 3) frontmatter만 필터 (본문 노이즈 없음)
Grep pattern="^tags:.*jwt" path="agent-context"
Grep pattern="^level: post-it" path="agent-context"   # 가장 작은 것 우선
Grep pattern="^priority: [45]" path="agent-context"
# 4) 히트한 1~2개만 Read
```

`search-lite`의 계층 로직(post-it→library)은 위 Grep 순서와 동일한 규칙의 코드화일 뿐이라, 어느 쪽이든 같은 결과에 도달한다. **환경이 서브에이전트를 못 부려도 기능 손실 0.**

## 손실 최소 설계

- **저장 시점 분산**: 압축은 "끝났을 때" 요약하지만, 여기선 "생성 시점"에 저장 — 잃을 원본이 채팅에만 있지 않음
- **포인터 번들**: 핸드오프는 요약이 아니라 `path` 링크 묶음 — 심층은 원본 그대로 보존, 필요할 때 정확히 읽음
- **CURRENT.md**: 새 세션이 무엇부터 읽을지 헤매지 않게 하는 50 tok 짜리 진입점

## 검증

```bash
node tools/agent-handoff.mjs save --session t1 --task "test" --next "verify"
node tools/agent-handoff.mjs load
cat agent-context/CURRENT.md
node tools/benchmark-resume.mjs        # BENCHMARK.md Session resume 섹션 갱신
```
