<!-- Path: ROADMAP.md -->
# Roadmap — 6점 비전 반영 현황 (외부 리뷰·사용자 제안 통합)

> 각 항목은 **채택/부분/보류**와 근거를 함께 기록한다. 전부 지금 하면 zero-install 철학이 무너지므로, 순서가 설계의 일부다.

## #1 규칙 기반 → 의미 이해 — **부분 완료, 단계적 확장**

| 단계 | 상태 | 내용 |
|---|---|---|
| 1a 동의어 확장 | ✅ v0.4.x | config `search.synonyms` — jwt↔token 등, 0 LLM. `token authentication` → JWT entry 히트 실측 |
| 1b 필드 가중치(BM25-lite) | ✅ v0.5.0 | 제목×3 태그×2 피처×2 요약×1 — naive includes 대비 랭킹 품질 향상 |
| 1c 로컬 임베딩 | 🔶 opt-in 어댑터 | `search.semantic.enabled=true` 시 `@xenova/transformers` 동적 로드. **미설치면 실행조차 안 하고** `router.semantic`에 unavailable 사유 정직 표기 후 휴리스틱 폴백. 기본 OFF — "0-install 셀링포인트 유지"가 트레이드오프 결론 |

"가벼운 AI" 표현은 외부 리뷰 지적대로 **규칙 기반 휴리스틱 라우터**로 문서 전반에 명확히 표기했다.

## #2 수동 기록 → 자동 관찰 — **부분 완료 (후보 생성 방식)**

- 결과 중심 기록 원칙과 자동화는 **모순이 아니라 직렬**이다: 자동화는 *원시 신호*를 모으고, 결과 중심 원칙은 *승격된 기억*의 형식을 강제한다.
- 구현: `tools/ac-watch.mjs` — git 이력에서 R1 fix-signal / R2 test+src co-change / R3 대형 변경 / R4 decision-word를 감지해 `.candidates/`에 **후보** 생성 (0 LLM). 실측: 최근 7일 커밋에서 12건 후보.
- 오염 방지: 후보는 `status: proposed`, `epistemic: observed`로 자동 확정되지 않음. 에이전트가 결론을 덧붙인 뒤 `promote`해야 정식 기억.

## #3 파일 → 지식 그래프 — **기반 완료, 심화는 P1**

- `index.json.knowledge.edges[]`: related[]에서 유추한 인과 엣지 (`bug→learning=mitigates/caused_by`, `decision supersedes`, `idea adopted_from`, `code-history implements`).
- 현재는 1-hop 유추. P1: supersedes 체인 전개로 "이 결정이 왜 뒤집혔나" 질의 지원, graph.json과 병합.

## #4 토큰 벤치마크 → 작업 성공률 — **프록시 하네스 완료, 실전 과제는 P1**

- `tools/benchmark-task.mjs`: 질의→정답 파일 도달율(retrieval-task accuracy) + 과업당 토큰 측정. 현재 소규모 실측: accuracy 100%, 88 tok/task (표본 3 — 한계 명시).
- 정직한 선언: 이것은 프록시다. AgentRadio식 실작업 성공률(버그 수정 성공) 비교는 라이브 에이전트 하네스가 필요하며 P1 과제로 남긴다.

## #5 실사용 규모 검증 — **도구 준비 완료, 운영 축적 필요**

- 장기 운영 문제(오래된 기억 vs 최신 결정 모순)의 첫 도구: `index.json.stale{}` — priority≥4 · 90일 경과 항목 리포트.
- 진짜 답은 시간이 필요하다: 수백~수천 entry, 다중 에이전트 운용 데이터가 쌓여야 검증된다. ROADMAP상 P1 유지.

## #6 JSON → SQLite — **선택 백엔드 완료 (Node 내장, 0 npm install)**

- `tools/ac-fts.mjs`: Node ≥22.5 내장 `node:sqlite`로 FTS5 build/query/status. better-sqlite3 불필요.
- 미지원 환경(Node 20 등)은 JSON+Grep 폴백이 **기능 손실 없이** 계속 동작 — 전환 임계는 entries 300+ 권장.

## 우선순위 (외부 리뷰 P0/P1/P2 재편성)

- ~~P0 retrieval recall~~ → 1a·1b 완료, 1c opt-in
- ~~P0 provenance~~ → schema `epistemic/source/verified_by` (v0.4.1), watch 후보는 `observed`로 자동 부여
- ~~P0 concurrency~~ → index atomic write(tmp+rename), 6-프로세스 병령 스모크 테스트 통과
- P1 실전 벤치마크 / decision graph 심화 / E2E CI 유지보수
- P2 vector DB·MCP server — 당분간 보류 (zero-install 철학)
