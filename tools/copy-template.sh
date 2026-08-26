#!/usr/bin/env bash
# Path: tools/copy-template.sh
# Usage: curl -fsSL https://raw.githubusercontent.com/tak2-08/agent-shared-context/main/tools/copy-template.sh | bash
#        curl -fsSL .../copy-template.sh | bash -s -- --project my-app --features auth,api
# 이전 이름 agent-context는 리다이렉트됨 (https://github.com/tak2-08/agent-context → agent-shared-context)
set -euo pipefail
REPO="tak2-08/agent-shared-context"
BRANCH="main"
ROOT_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}"

echo "→ agent-shared-context template copy (${REPO}@${BRANCH}) — inter-agent shared context"
mkdir -p agent-context/{notes,learnings,bugs,decisions,ideas,diary,todos,code-history,archive} tools

fetch() {
  local src="$1" dst="$2"
  echo "  fetch $src → $dst"
  curl -fsSL "${ROOT_URL}/${src}" -o "${dst}"
}

fetch "agent-context.config.json" "agent-context.config.json"
fetch "agent-context/schema.json" "agent-context/schema.json"
fetch "agent-context/features.json" "agent-context/features.json"
fetch "agent-context/graph.json" "agent-context/graph.json"
fetch "agent-context/index.json" "agent-context/index.json"
fetch "agent-context/README.md" "agent-context/README.md"
fetch "tools/agent-context-index.mjs" "tools/agent-context-index.mjs"
fetch "tools/agent-context-validate.mjs" "tools/agent-context-validate.mjs"
fetch "tools/agent-context-init.mjs" "tools/agent-context-init.mjs"
chmod +x tools/agent-context-index.mjs tools/agent-context-validate.mjs 2>/dev/null || true

for d in notes learnings bugs decisions ideas diary todos code-history archive; do
  touch "agent-context/$d/.gitkeep" 2>/dev/null || true
done

if command -v node >/dev/null 2>&1; then
  echo "→ node tools/agent-context-index.mjs --init"
  node tools/agent-context-index.mjs --init || true
fi

echo "✓ done — edit agent-context.config.json then: node tools/agent-context-index.mjs --init"
echo "  next: cp templates/frontmatter/*.md agent-context/learnings/  (if templates fetched)"
