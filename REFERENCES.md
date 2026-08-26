<!-- Path: REFERENCES.md -->
# References & Attribution

This `agent-shared-context` (inter-agent shared context DB) was upgraded by reverse-engineering recent Claude session communication and referencing AgentRadio. This file discloses which parts were referenced, under which licenses, and what was **not** copied (clean-room file-based adaptation).

## AgentRadio — Coral-Protocol/AgentRadio (Apache 2.0)

- **Repo**: https://github.com/Coral-Protocol/AgentRadio
- **Paper**: `AgentRadio: Passive Awareness for Long-Horizon Multi-Agent Collaboration` (Ren et al., 2026, Coral AI Labs, SnT — Université du Luxembourg, King's College London, University of Hull) — `arXiv:2607.28430` https://arxiv.org/abs/2607.28430
- **License**: `Apache License 2.0` (`LICENSE` at repo root) — https://github.com/Coral-Protocol/AgentRadio/blob/main/LICENSE
- **Referenced concepts** (adapted file-based, no binary copied):
  - Three primitives: `create_thread(name, participants)` / `send_message(thread, content, mentions)` / `wait_for_mention(timeout)`
  - Five-phase protocol: `P1 Explore` → `P2 Divide` → `P3 Execute` → `P4 Review` → `P5 Submit` (assembler gates transitions, unanimous approval)
  - Passive awareness: `wait_for_mention` as **background task** (no turn stolen, surfaces at next step boundary) vs **foreground blocking receive** (costs a turn) — single-bit difference that lifts 4-agent SWE-Atlas QnA 124 tasks from `51.6%` (L2) to `62.1%` (L3) on Opus 4.6 (`p=0.0023`), paper Table 1
  - No harness modification: harness only runs shell command in background (here `node tools/agent-radio.mjs wait`)
  - No extra LLM calls: watcher is OS process, not agent step, only surfaced messages cost tokens
  - Model-agnostic (Claude Opus 4.6 and DeepSeek-V4-Pro via LiteLLM proxy — here file-based, no proxy)
  - Ablation ladder `B0 (single)` → `L1 (4 agents + division)` → `L2 (+ negotiation blocking)` → `L3 (+ passive awareness)` — evaluation method
- **Not copied**: `multi_agent/coral-server.jar` (106 MB binary, hosted via Google Drive `confirm=t`), `passive_scripts/` MCP-over-HTTP, `monitor_coral_log.sh`, `run_config/qa/`, `data/qa/` 124 SWE-Atlas tasks, `verify_local.py` LLM judge, LiteLLM proxy `deepseek_litellm_modal.py`, Docker/Modal/Harbor setup, Harbor 0.6.4 pin, etc. Our adaptation is **file-based** `agent-context/radio/threads/<name>.json` + `sessions/inbox/<agent>.jsonl`, no server.
- **Files in this repo that reference AgentRadio**: `tools/agent-radio.mjs:1` (header attribution), `docs/radio.md:1` (full table), `REFERENCES.md` (this file), `README.md` (references section), `skills` (protocol mention)
- **Citation** (as in AgentRadio README):
  ```bibtex
  @misc{ren2026agentradio,
    title  = {AgentRadio: Passive Awareness for Long-Horizon Multi-Agent Collaboration},
    author = {Xinxing Ren and Qianbo Zang and Ziyan Wang and Caelum Forder and Suman Deb and Peter Carroll and Zekun Guo},
    year   = {2026},
    eprint = {2607.28430},
    archivePrefix = {arXiv},
    url    = {https://arxiv.org/abs/2607.28430}
  }
  ```

## Claude Code Cross-Session Messaging (v2.1.224, Aug 7 2026, reverse-engineered)

- **Docs**: https://code.claude.com/docs/en/cross-session-messaging (official, not code) — `ListAgents` / `SendMessage` two tools, `/list-agents` (`/peers`), `crossSessionInbound` `accept`/`hold`/`refuse`, `isolatePeerMachines`, per-session Unix socket vs named pipe, `CLAUDE_CODE_MESSAGING_SOCKET`, plain text only, between tool calls or new turn if idle, `claude -p` workers, rate-limit/dedup/max 50/100, cross-machine via Anthropic servers (reply-only until v2.1.225), provider exclusions (Bedrock/GCP Agent Platform/Microsoft Foundry, native Windows excluded)
- **Changelogs & coverage**: v2.1.224 (Aug 7) cross-session, v2.1.225 (Aug 8) cross-machine start, v2.1.232 (Aug 13) `@` mention, plus Developers Digest, StartDebugging, The Decoder, AI Weekly, Claude Camp, XenoSpectrum coverage (Aug 7-15 2026)
- **Open-source analysis** (Apache 2.0 or educational, no binary copied):
  - `anthropics/claude-code` PR #41447 `feat: open source claude code` (513k lines, 1902 files, `+513237 -0`) — community statement, harness structure, session ID derivation, `~/.claude/sessions/` JSON, `snapshot-unknown.txt` bug, hooks `SessionStart`/`SubagentStart` with `session_id` stdin, `CLAUDE_ENV_FILE` injection, `listAgents`/`sendMessage` wiring — **Apache 2.0 when merged** (educational statement PR, not official yet)
  - `LING71671/Open-ClaudeCode` (v2.1.88, 1,902 files recovered from source maps, 512,664 lines, `query.ts` 785KB) — MIT/educational, `session/index.ts` persistence & recovery, `SessionManager start({resume:true})`, `loop.ts`, `src/session/` recovery, `node package/cli.js -r <session-id>` resume — **MIT (recovered source maps, educational)**
  - `C293943/claude-code-open` (v2.0.76) — educational, `src/session/` `SessionManager` `listSessions` `loadSession`, `client.ts`, `session.ts` autoSave
  - `montisan/claude-code-source-code` (v2.1.88, 1,884 files, 512k lines, bundled `cli.js` 12MB, `src/` unbundled from `cli.js`) — educational, `feature()` Bun intrinsics, `MACRO.VERSION`, `memory/` `git/` `github/` `bash/` `swarm/` etc.
  - Issues #20132 (expose session ID, workaround `SessionStart` hook `CLAUDE_ENV_FILE` + `jq` `additionalContext`), #47018 (expose `CLAUDE_SESSION_ID` env, `snapshot-unknown.txt` `session=unknown`) — shell-level session discovery, per-session unique key for collisions
- **What was reverse-engineered** (concepts only, file-based clean-room):
  - `ListAgents` → `listAgents()` reading `sessions/sessions.json`
  - `SendMessage` → `sendMessage(target, content)` appending to `sessions/inbox/<target>.jsonl`, plain text only, `/compact` as plain text, cannot approve permission, cannot change `CLAUDE.md`
  - Per-session Unix socket → per-session **file inbox** `sessions/inbox/<name>.jsonl` (`socket=file:...`), same-machine file never traverses servers (like Unix socket), cross-machine via `git push` would traverse git remote (like Anthropic servers for Remote Control)
  - `crossSessionInbound` `accept`/`hold`/`refuse` + `isolatePeerMachines` + rate-limit/dedup/max 50/100 + plain text only + between tool calls / new turn if idle — all re-implemented in `tools/agent-sessions.mjs` reading `sessions/config.json`
  - Session persistence `~/.claude/sessions/<pid>.json` `{ pid, sessionId }` + `SessionManager` `resume` → our `sessions/sessions.json` `{ name, id, started_at, pid, inbox, socket, crossSessionInbound }` + `registerSession(name)`
- **Not copied**: No `cli.js` (12MB bundle), no `~/.claude/sessions/` JSON, no `claude-token` OAuth helper, no `anthropics/claude-code` source file verbatim, no `LING71671/Open-ClaudeCode` `src/` file verbatim. Only **concepts** (inbound policies, socket/inbox, plain text, rate limits) were re-implemented file-based.
- **Files in this repo that reference Claude sessions**: `tools/agent-sessions.mjs:1` (header with all 4 open-source repos), `docs/sessions.md:1` (full reverse-engineering table), `REFERENCES.md` (this file), `README.md` + `skills` (live sessions mention)
- **Docs**: `docs/sessions.md` is the full reverse-engineering disclosure, including file-based adaptation table and verification commands

## This repo's license

- **This repo** (`tak2-08/agent-shared-context`): `MIT` (`LICENSE`) — file-based adaptation is MIT, but it **discloses** that the **concepts** referenced are Apache 2.0 (AgentRadio, claude-code PR #41447) or educational MIT (Open-ClaudeCode etc.).
- **No binary or source file was copied verbatim** from Apache 2.0 repos. Only **concepts, primitives names, protocol phases, and inbound policy ideas** were referenced and re-implemented as **file-based** JSON/JSONL + Node.js `fs` poll, with clean-room code.
- **Compliance**: Apache 2.0 requires preservation of copyright/license notices when **distributing code** — since we did **not** distribute Apache 2.0 code, only referenced concepts, we comply by **attribution disclosure** in this file and per-file headers (`tools/agent-radio.mjs:1`, `tools/agent-sessions.mjs:1`, `docs/radio.md:1`, `docs/sessions.md:1`). If we later vendor any Apache 2.0 file verbatim, we will include its `LICENSE`/`NOTICE`.

## How to verify attribution

```bash
grep -r "AgentRadio" --include="*.md" --include="*.mjs" -n | head
grep -r "Coral-Protocol" --include="*.md" --include="*.mjs" -n | head
grep -r "crossSessionInbound" --include="*.md" --include="*.mjs" -n | head
grep -r "CLAUDE_CODE_MESSAGING_SOCKET" --include="*.md" --include="*.mjs" -n | head
cat REFERENCES.md
cat docs/radio.md | head -40
cat docs/sessions.md | head -60
```
