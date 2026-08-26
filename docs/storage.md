<!-- Path: docs/storage.md -->
# 스토리지 — 1층 Git 정본 + 2층 런타임

## 구조

```
1층 Git 정본 (source of truth, 항상)
  agent-context/*.md + index.json + graph.json + features.json + schema.json
  - PR 리뷰, git blame, git log --follow 가능
  - 모든 agent가 git pull로 동기화
  - storage.backend 값과 무관하게 항상 존재

2층 런타임 파생 (선택, privateMirror != null)
  ┌─────────────┬──────────────┬──────────────────────┐
  │ backend=json│ php-file     │ sqlite               │
  │ (기본)      │ (PHP 호환)   │ (1000+ entries)      │
  │ 2층 없음    │ runtime.php  │ search.db (FTS5)     │
  │ Grep 50ms   │ t2_private_store pattern │ SELECT MATCH 20ms │
  └─────────────┴──────────────┴──────────────────────┘
  공통: .gitignore 대상, 생성물 커밋 금지, md가 정본
```

## backend

| backend | `privateMirror` | 생성물 | 동기화 | 적합 |
|---|---|---|---|---|
| `json` (default) | `null` | 없음 | `node tools/agent-context-index.mjs` | 모든 JS/TS/Python, 0 의존성 |
| `php-file` | `".agent-context-runtime"` | `runtime.php` (PHP `return [...]` 가드) | `node tools/agent-context-index.mjs --to-php` | Rhymix/WordPress 등 PHP CMS |
| `sqlite` | `".agent-context-runtime"` | `search.db` (FTS5) | `node tools/agent-context-index.mjs --to-sqlite` | 500+ entries, Grep 500ms → FTS 20ms |

## 원칙 (T2Editor 계승)

1. **파일이 정본**: `*.md`를 지우고 DB만 남기는 마이그레이션 금지. `decisions/0001`에서 JSON 단독 기각 이유와 동일 — 충돌·diff 가독성.
2. **파생은 재생성 가능**: `search.db`는 언제든 `*.md → index.json`으로부터 재생성. `git clean -fdx` 후 1명령 복구.
3. **1층만으로 완결**: `backend=json`에서도 3단계 프로토콜·토큰 절약이 100% 동작. 2층은 성능 최적화일 뿐.

## 설정

`agent-context.config.json`:

```json
{
  "contextRoot": "agent-context",
  "privateMirror": null,
  "storage": {
    "backend": "json",
    "softLimits": { "softLimitChars": 200000, "maxEntries": 1000, "archiveAfterDays": 90 }
  }
}
```

### privateMirror 예시

- 로컬: `".agent-context-runtime"` → `.gitignore`에 `/runtime/` 이미 포함
- 서버: `"/var/lib/myapp/agent-context"` → 절대 경로
- S3 등 원격은 현재 미지원, 필요 시 `storage.backend` 확장

## 운영

- `SOFT_LIMIT_CHARS=200000 / MAX_ENTRIES=1000` 초과 시 `index.json:soft_limits.should_compress=true` → 낮은 `priority`부터 `archive/` 이동
- 삭제는 `status: archived` 소프트 삭제, `git rm`은 30일 후
- `Write` 덮어쓰기 금지, `Read` 후 `Edit` + `updated` 갱신

## T2Editor 대조

- T2Editor: `T2EDITOR_DATA_PATH` vs `DB_PATH` vs `PRIVATE_PATH` 3분리, `T2Editor/config/t2_private_store.php:67` `t2_private_store_write` 패턴
- Universal: `privateMirror` 1개로 단순화, `php-file` backend 선택 시에만 해당 패턴 차용
- 원본 `t2_storage.php` 참조는 `tak2-08/T2Editor-v11` `T2Editor/config/t2_storage.php:284`에서 직접 확인 (공개 universal에는 미포함)
