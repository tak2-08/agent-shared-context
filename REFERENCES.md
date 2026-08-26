<!-- Path: REFERENCES.md -->
# References & Attribution

This `agent-shared-context` builds on established patterns for inter-agent collaboration, with file-based adaptation and attribution below. No binary or source file was copied verbatim — only concepts and protocol ideas were adapted.

## AgentRadio — Coral-Protocol/AgentRadio (Apache 2.0)

- **Repo**: https://github.com/Coral-Protocol/AgentRadio
- **Paper**: `AgentRadio: Passive Awareness for Long-Horizon Multi-Agent Collaboration` (Ren et al., 2026, Coral AI Labs) — `arXiv:2607.28430` https://arxiv.org/abs/2607.28430
- **License**: `Apache License 2.0` — https://github.com/Coral-Protocol/AgentRadio/blob/main/LICENSE
- **Concepts that inspired this repo** (adapted file-based):
  - Three primitives: `create_thread(name, participants)` / `send_message(thread, content, mentions)` / `wait_for_mention(timeout)`
  - Five-phase collaboration: `P1 Explore` → `P2 Divide` → `P3 Execute` → `P4 Review` → `P5 Submit` (coordinator gates transitions)
  - Passive awareness: `wait_for_mention` as background task (surfaces at next step boundary, no turn cost) vs foreground blocking receive (costs a turn)
  - No harness modification: shell command in background is enough (here `node tools/agent-radio.mjs wait`)
  - No extra LLM calls: watcher is OS process, only surfaced messages cost tokens
  - Model-agnostic and ablation methodology `B0 → L3` for evaluation
- **Adaptation**: `tools/agent-radio.mjs` uses `agent-context/radio/threads/<name>.json` + `sessions/inbox/<agent>.jsonl` file threads, no server. See `docs/radio.md`.
- **Not copied**: `coral-server.jar`, `passive_scripts/`, `monitor_coral_log.sh`, `data/qa/`, `verify_local.py`, Docker/Modal/Harbor setup, etc.
- **Citation**:
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

## Session Collaboration Patterns

- **Inspiration**: Contemporary inter-agent session coordination as documented in modern agent tools (session discovery, direct messaging, per-session inbox, inbound policies `accept`/`hold`/`refuse`, plain-text delivery between tool calls). Our file-based layer adapts these **concepts** without vendor-specific implementation.
- **Adaptation**: `tools/agent-sessions.mjs` provides `list` / `send <target> <msg>` / `inbox` / `wait` over `agent-context/sessions/sessions.json` + `sessions/inbox/<name>.jsonl` (file inbox, same-machine never traverses servers). Policies `crossSessionInbound`, `isolatePeerMachines`, rateLimit/dedup are configurable in `sessions/config.json`.
- **Not copied**: No binary, no vendor session JSON, no OAuth helpers. Only the coordination **pattern** (discovery, inbox, plain text, inbound policy) was adapted file-based.
- **Details**: See `docs/sessions.md` for the file-based adaptation table.

## This repo's license

- **This repo** (`tak2-08/agent-shared-context`): `MIT` — adaptation is MIT, referenced concepts remain Apache 2.0 with attribution here and per-file headers (`tools/agent-radio.mjs:1`, `tools/agent-sessions.mjs:1`, `docs/radio.md:1`, `docs/sessions.md:1`).

## How to verify

```bash
grep -r "AgentRadio" --include="*.md" --include="*.mjs" -n | head
grep -r "Coral-Protocol" --include="*.md" --include="*.mjs" -n | head
cat REFERENCES.md
cat docs/radio.md | head -40
cat docs/sessions.md | head -60
```
