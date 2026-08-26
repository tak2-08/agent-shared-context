<!-- Path: examples/nextjs-app/README.md -->
# nextjs-app — agent-context 예시 (Next.js 14 App Router)

이 예시는 Next.js 프로젝트에 `agent-context`를 붙이는 최소 예시.

## 설정

- `contextRoot: "agent-context"` — Next.js 루트에 그대로 둠, `next.config.js`와 충돌 없음
- `features.ui.files`에 `src/app/globals.css:1` — 디자인 토큰 예시
- `storage.backend: json` — Vercel 배포 시 2층 불필요, Git 정본만으로 충분

## 사용

```bash
cp -r examples/nextjs-app/agent-context.config.json ./
cp -r examples/nextjs-app/agent-context ./agent-context
node tools/agent-context-index.mjs --init
node tools/agent-context-index.mjs
```

- `src/app/globals.css:1`에 디자인 토큰, `src/lib/auth.ts:1`에 인증
- `graph.json` `ui → api → auth` 간선으로 영향 추적
