<!-- Path: examples/python-cli/README.md -->
# python-cli — agent-context 예시 (Python Click CLI)

Python CLI 프로젝트에 `agent-context`를 붙이는 예시.

## 설정

- `storage.backend: sqlite` — CLI는 `Grep` 대신 `sqlite3` FTS가 자연스러움, `privateMirror: .agent-context-runtime`에 `search.db` 생성
- `features.cli.storage.api` 3개 — `src/cli.py`, `src/storage/db.py`, `src/client.py`

## 사용

```bash
cp -r examples/python-cli/agent-context.config.json ./
cp -r examples/python-cli/agent-context ./agent-context
node tools/agent-context-index.mjs --init
node tools/agent-context-index.mjs --to-sqlite  # FTS 생성 (선택)
```

- `pyproject.toml`에 `[tool.agent-context] contextRoot = "agent-context"` 미러 가능 (문서 참조)
