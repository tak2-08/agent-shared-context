<!-- Path: docs/radio.md -->
# Radio — Passive Awareness (AgentRadio, Apache 2.0)

> **Attribution**: Concepts referenced from `Coral-Protocol/AgentRadio` (Apache 2.0, https://github.com/Coral-Protocol/AgentRadio, paper `arXiv:2607.28430`). This file documents which parts were referenced and how they were adapted to a file-based `agent-shared-context` (no server, no harness modification, no extra LLM calls).

## Why AgentRadio matters for agent-shared-context

AgentRadio's single-bit change — `wait_for_mention` as **background task** (passive awareness, L3) vs **foreground blocking receive** (L2, costs a turn) — lifts 4-agent task accuracy from `51.6%` (L2 negotiation, blocking receive) to `62.1%` (L3 passive awareness) on Opus 4.6, SWE-Atlas QnA 124 tasks, with identical primitives/threads/protocol. The same protocol, same harness, only placement of `wait_for_mention` differs, isolates the gain (`p=0.0023` Opus 4.6, `p=0.0026` DeepSeek, `15` wins `2` losses). That isolation is why we adapted it.

## Referenced concepts (Apache 2.0, with adaptation)

| AgentRadio concept | How we referenced & adapted | File-based change |
|---|---|---|
| **Three primitives** `create_thread(name, participants)` / `send_message(thread, content, mentions)` / `wait_for_mention(timeout)` | Directly referenced — same names, same behavior, same `may @-mention` | Threads as `agent-context/radio/threads/<name>.json` (instead of Coral message server `coral-server.jar`), `send_message` appends JSON and also writes to each mentioned agent's file inbox `sessions/inbox/<agent>.jsonl` so background watcher can surface without extra LLM call |
| **Passive awareness** `wait_for_mention` as background task (no turn stolen) vs foreground `blocking receive` (costs a turn) | Core upgrade — we add `tools/agent-radio.mjs wait <agent>` that **polls inbox file every 500ms** and surfaces at next step boundary, vs foreground `tools/agent-sessions.mjs wait` that would block the agent's turn | File inbox poll simulates OS background task; no harness modification, no extra LLM calls, only surfaced messages cost tokens (like AgentRadio's watcher OS process) |
| **Five-phase protocol** P1 Explore → P2 Divide → P3 Execute → P4 Review → P5 Submit (assembler gates) | Referenced as template for long-horizon multi-agent work, not enforced | `tools/agent-radio.mjs protocol` prints P1-P5 with L3 nuance: P3 discovery triggers worklog post immediately that lands via passive awareness mid-flight (vs blocking where sharing disappears until P4) |
| **No harness modification** — harness only runs shell command in background | Kept — our threads are shell primitives `node tools/agent-radio.mjs create-thread/send/wait`, no server to run | File-based: no `coral-server.jar`, no Docker, no Modal, no Harbor |
| **No extra LLM calls** — watcher is OS process, not agent step | Kept — watcher is `nohup` background poll, not LLM | Same |
| **Model-agnostic** — same protocol on Opus 4.6 and DeepSeek via LiteLLM proxy | Kept — file inbox is model-agnostic, no LiteLLM needed | Same |
| **Ablation ladder** B0→L1→L2→L3 | Documented as evaluation method, not implemented | `docs/radio.md` describes ladder for users to replicate with file-based |

**Not referenced**: `coral-server.jar` binary, `passive_scripts/` MCP-over-HTTP, `monitor_coral_log.sh`, Docker/Modal/Harbor setup, `run_config/qa/`, `data/qa/` 124 tasks, `verify_local.py` LLM judge, LiteLLM proxy, etc. — we use **file-based** threads instead.

## File-based primitives (this repo)

```bash
# Threads live in agent-context/radio/threads/<name>.json
node tools/agent-radio.mjs create-thread planning "claude,codex,opencode,system"
# → { created: true, name: "planning", id: "planning-xxx", participants: [...] }

node tools/agent-radio.mjs send planning "found JWT race, affects api — @codex check src/auth/refresh.ts:42" --mention @codex --from claude
# → { sent: true, mentions: ["codex"], note: "background wait surfaces at next step boundary, no turn stolen" }

node tools/agent-radio.mjs wait codex --timeout 30000
# → { mention: {...}, snapshot: { planning: {...}, ... }, note: "full snapshot so no second read needed" }

node tools/agent-radio.mjs list-threads
node tools/agent-radio.mjs read-thread planning
node tools/agent-radio.mjs protocol  # P1-P5
```

- `send_message` returns immediately whether anyone listening (like AgentRadio), `wait_for_mention` blocks until mention arrives then returns **full snapshot of every thread** so caller never needs second read.
- `create_thread` is idempotent, participants are for negotiation gating (assembler collects approvals).
- File-based: `send_message` also appends to each mentioned agent's `sessions/inbox/<agent>.jsonl` for passive awareness polling.

## Passive vs blocking

| Mode | Where `wait_for_mention` runs | Cost | P3 live sharing |
|---|---|---|---|
| **L2 blocking receive** | foreground (agent stops working to listen) | 1 turn per message heard | disappears — agents fall silent while they work, discovery only at P4 |
| **L3 passive awareness** | background task (poll file inbox) | 0 turn, surfaces at next step boundary | immediate — discovery posted in P3 lands mid-flight, teammate folds into task |

Our default is **L3**: `node tools/agent-radio.mjs wait <agent>` is intended to run as `nohup ... &` background, harness surfaces mention at next step boundary.

## Five-phase protocol (adapted)

```json
{
  "P1_Explore": "every agent starts background watcher, independently explores repo, drafts sub-questions. Nothing sent.",
  "P2_Divide": "assembler opens planning thread. Agents pool findings, negotiate partition, revise until every agent approves.",
  "P3_Execute": "each agent works its sub-questions. Discovery triggers worklog post immediately — passive awareness lands immediately (vs blocking where sharing disappears until P4)",
  "P4_Review": "each agent broadcasts findings with evidence in own results thread. Reviewers post conflicts, thin evidence, can send sub-question back to P3.",
  "P5_Submit": "assembler composes final answer from approved results, broadcasts draft for last approvals, submits."
}
```

`tools/agent-radio.mjs protocol` prints this.

## Attribution & License

- **Source**: `Coral-Protocol/AgentRadio` https://github.com/Coral-Protocol/AgentRadio, `LICENSE` Apache 2.0, paper `arXiv:2607.28430` (Ren et al., 2026, Coral AI Labs)
- **License**: Apache 2.0 — our file-based adaptation is also MIT, but we disclose that the **concepts** (three primitives, five-phase protocol, passive awareness, no harness modification, no extra LLM calls, model-agnostic, ablation B0→L3) were referenced from AgentRadio's Apache 2.0 repo. Binary `coral-server.jar` and Docker/Modal/Harbor setup were **not** copied.
- **Citation**: `@misc{ren2026agentradio, title={AgentRadio: Passive Awareness for Long-Horizon Multi-Agent Collaboration}, author={...}, year={2026}, eprint={2607.28430}}` — see `REFERENCES.md`

## Verification (file-based, no Docker)

```bash
node tools/agent-radio.mjs create-thread test "a,b"
node tools/agent-radio.mjs send test "hello @codex" --from claude
node tools/agent-radio.mjs read-thread test
node tools/agent-radio.mjs wait codex --timeout 5000
ls agent-context/radio/threads/
ls agent-context/sessions/inbox/
```

No Docker, no Modal, no Harbor, no `coral-server.jar` required — file inbox replaces message server.
