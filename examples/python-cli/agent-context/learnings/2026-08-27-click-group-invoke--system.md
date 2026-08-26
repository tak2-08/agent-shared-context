<!-- Path: examples/python-cli/agent-context/learnings/2026-08-27-click-group-invoke--system.md -->
---
id: learning-20260827-c3d4e5f6
type: learning
title: "Click group invoke 시 context 누락으로 사이드이펙트"
tags: [cli, click, context, group]
feature: cli
scope: global
agent: system
created: 2026-08-27T10:00:00+09:00
updated: 2026-08-27T10:00:00+09:00
status: done
priority: 5
summary: "click.group에서 @click.pass_context 없이 invoke하면 ctx.obj가 None"
related: [decisions/0001-use-sqlite-fts-for-1000plus.md]
affects: [cli]
cause: "테스트에서 CliRunner.invoke(cli, ['sub']) 시 부모 context 미전달"
fix: "src/cli.py:18 @click.group() + @click.pass_context, tests에서 obj={'db': ...} 전달"
lesson: "Click group은 항상 pass_context, 테스트는 obj 명시"
keywords:
  ko: [그룹, 컨텍스트]
  en: [click, group, context]
---

## 현상
`CliRunner.invoke(cli, ['db', 'migrate'])` 시 `ctx.obj`가 `None`으로 `AttributeError`.

## 원인
`@click.group()`만 쓰고 `@click.pass_context` 누락.

## 해결
`@click.group()\n@click.pass_context\ndef cli(ctx):`.

## 교훈
Click group은 `pass_context` 필수.

## 연관
- `cli` feature
