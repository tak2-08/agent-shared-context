<!-- Path: docs/migration-from-t2editor.md -->
# T2Editor → Universal 마이그레이션 가이드

원본: `tak2-08/T2Editor-v11` `T2Editor/agent-context` ( `e42e8fd` PR #97, 16파일 1093라인 )

## 경로 매핑

| T2Editor | Universal | 변경 |
|---|---|---|
| `T2Editor/agent-context/` | `agent-context/` | `T2Editor/` prefix 제거 |
| `T2Editor/agent-context/index.json` `_path` | `agent-context/index.json` | `agent-context.config.json` `contextRoot`로부터 생성 |
| `tools/agent-context-index.mjs` `ROOT = '../T2Editor/agent-context'` | `ROOT = config.contextRoot` | `resolveConfig()`로 동적 |
| `T2Editor/css/t2-foundation.css:299` | `src/tokens.css:1` (예시) | `features.*.files`에서 프로젝트 경로로 교체 |
| `T2Editor/js/utils/ai/tools/memory.js:60` | 제거 (legacy) | `docs/migration` 대조표에만 언급 |
| `T2Editor/config/t2_private_store.php:67` | `privateMirror` + `storage.backend` | `php-file` backend 선택 시에만 차용 |
| `/T2Editor/data/` `.gitignore:8` | `/runtime/` | `privateMirror` 경로만 ignore |
| `t2-static-check` `release-artifact` | 제거 | 경량 gate 3종으로 축소 |

## 대조표 — localStorage vs file DB

| 구분 | T2Editor `memory.js:60` `t2ai_mem_v1` | Universal `agent-context` |
|---|---|---|
| 저장 | `localStorage` 브라우저 1대 | `Git` 공용, 모든 agent 공유 |
| 용량 | 20,000 chars / 300 entries | 200,000 chars / 1000 entries (10배) |
| 검색 | `memory_recall` 키워드 | `Read index.json` + `Grep ^tags:` + `graph` |
| 압축 | `memory_compress` 자동 | `should_compress=true` → `archive/` 이동 |
| 스코프 | `page/global/custom` | `feature` 그래프 + `scope` |

## 18개 추상화 항목

`agent-context.config.json` 단일 원천으로 수렴:

- `contextRoot` — 경로 22곳 치환
- `features` — 11 features → 프로젝트별 정의
- `graph.edges` — 9 edges → 프로젝트별 정의
- `storage.backend` / `privateMirror` — `json/php-file/sqlite`
- `agents.allow` / `i18n.locales` — `claude/codex/opencode/human/system`, `ko/en/ja/zh`
- `compliance.law/cssContract` — T2Editor `law/` / `t2-css-contract` 비활성

## 이식 단계

```bash
# 1. T2Editor 스냅샷 보존 확인
ls examples/t2editor/agent-context/  # 5 md + 4 json 원본 그대로

# 2. 기존 T2Editor 프로젝트에서 universal로 이동
cp -r T2Editor-v11/T2Editor/agent-context ./agent-context
cp T2Editor-v11/tools/agent-context-index.mjs ./tools/
# → universal의 agent-context-index.mjs로 교체 (config-aware)
curl -fsSL https://raw.githubusercontent.com/tak2-08/agent-context/main/tools/agent-context-index.mjs -o tools/agent-context-index.mjs

# 3. config 생성
cat > agent-context.config.json <<'JSON'
{
  "project": { "name": "t2editor", "displayName": "T2Editor" },
  "contextRoot": "agent-context",
  "features": {
    "foundation": { "label": "디자인 토큰", "files": ["T2Editor/css/t2-foundation.css:1"] }
  }
}
JSON

# 4. 재생성
node tools/agent-context-index.mjs --init
node tools/agent-context-index.mjs --check
```

## 스냅샷 보존

- `examples/t2editor/`는 PR #97 원본 16파일을 그대로 보존, 수정 금지
- `examples/t2editor/ORIGIN.md`에 출처(`e42e8fd`, PR #97, 1093라인) 명시
- `grep -r "T2Editor" agent-context/` → 0건 (examples 제외) — 순수성 증명

## T2Editor 연동 유지 (선택)

- **A. Copy** (단기): `cp -r universal/agent-context/* T2Editor/agent-context/`
- **B. Subtree** (장기): `git subtree add --prefix=T2Editor/agent-context https://github.com/tak2-08/agent-context.git main --squash`
