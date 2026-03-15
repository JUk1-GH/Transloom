# Transloom Heavy Harness

This directory is a repo-local control plane for long-running Claude development. It is intentionally separate from the Electron/Next.js runtime.

## Goals

- Keep feature inventory, execution queue, run artifacts, and recovery state outside product code.
- Support role-split work (`implementer`, `verifier`, `reviewer`) with explicit leases and handoffs.
- Preserve a clean, auditable ledger of what Claude was asked to do, what it changed, and how it was validated.
- Stay compatible with the project GitNexus guardrails in `AGENTS.md`.

## Layout

- `.harness/bin/control-plane.mjs` — CLI for bootstrap, queue leasing, dispatch, and status.
- `.harness/bin/supervisor-loop.mjs` — long-running supervisor that keeps dispatching Claude across role queues.
- `.harness/bin/product-loop.mjs` — autonomous product-iteration loop that uses the real app surface, chooses the next improvement itself, fixes it, retests it, and repeats.
- `.harness/config/policies.json` — tracked scheduler, role, retry, and validation policy.
- `.harness/prompts/*.md` — role-specific prompt preambles used to build prompt packs.
- `.harness/state/tasks.json` — mutable queue state generated from `feature_list.json`.
- `.harness/state/events.jsonl` — append-only task event ledger.
- `.harness/state/runs.jsonl` — append-only run ledger.
- `.harness/runs/<run-id>/` — prompt pack, metadata, and captured Claude logs for a single run.

`state/` and `runs/` are runtime data. They are intentionally ignored by git.

## Task Lifecycle

1. `queued` — ready for an implementer lease.
2. `implementing` — leased by an implementer.
3. `ready_for_verification` — implementation finished; verifier picks it up.
4. `verifying` — verifier lease is active.
5. `ready_for_review` — verification passed; reviewer picks it up.
6. `reviewing` — review lease is active.
7. `done` — fully accepted.
8. `blocked` — too many failed attempts or manual intervention required.

## Core Commands

Bootstrap the runtime state from `feature_list.json`:

```bash
npm run harness:bootstrap
```

Inspect health, queue state, and recent events:

```bash
npm run harness:doctor
npm run harness:status
```

Lease the next task for a role:

```bash
npm run harness -- lease --role implementer --owner claude-local
npm run harness -- lease --role verifier --owner claude-verify
```

Prepare a prompt pack without executing Claude:

```bash
npm run harness -- dispatch --task FT-001 --role implementer --owner claude-local
```

Run one full control-plane round, optionally executing Claude immediately:

```bash
npm run harness:supervise -- --role implementer --owner claude-local
npm run harness:supervise -- --role implementer --owner claude-local --exec
```

Run the long-lived heavy supervisor loop:

```bash
npm run harness:watch
npm run harness:drain
npm run harness:autopilot
npm run harness:product-loop
npm run harness:desktop-smoke
npm run harness:ft-autopilot
npm run harness:settle
npm run harness:supervise-loop -- --roles implementer,verifier,reviewer --owner claude-local --max-rounds 3
```

Record progress from the role that owns the lease:

```bash
npm run harness -- heartbeat --task FT-001 --owner claude-local
npm run harness -- complete --task FT-001 --role implementer --owner claude-local --note "lint/typecheck/test passed"
npm run harness -- fail --task FT-001 --role implementer --owner claude-local --reason "build:desktop still fails"
```

## Supervisor Loop Behavior

- `supervisor-loop.mjs` is additive. It does not replace the existing control-plane commands.
- The loop defaults to `reviewer,verifier,implementer` priority so already-in-flight work drains before new implementation starts.
- Each round leases the first available task for the highest-priority role, prepares a prompt pack, appends a `result.json` handoff contract, runs Claude, and records `run.started` / `run.finished` or `run.errored` ledger entries.
- Heavy unattended runs now stream into `.harness/runs/<runId>/session.log` while Claude is still alive, and each run also captures Claude CLI diagnostics in `.harness/runs/<runId>/claude.debug.log`.
- The supervisor now runs Claude in a tighter unattended profile by default: `--setting-sources local`, `--strict-mcp-config`, `--disable-slash-commands`, `--no-session-persistence`, and `--output-format stream-json`.
- If Claude exits non-zero, the supervisor immediately calls `fail` for the leased task so the queue does not sit on an expired lease.
- If Claude exits zero and the child agent wrote a valid `result.json`, the supervisor auto-applies `complete` or `fail` based on that handoff.
- If Claude exits zero but the handoff file is missing or invalid, the supervisor treats that as a failed unattended run and automatically requeues or blocks the task.
- The loop now heartbeats active leases while the child is running and will kill/auto-fail runs that exceed `--idle-timeout-ms` or `--max-runtime-ms` instead of silently hanging forever.
- In unattended mode, manual gates are treated as best-effort evidence: the verifier and reviewer must call out anything they could not observe directly, but the loop still decides `complete` or `fail` without waiting for a human.
- `harness:watch` keeps polling forever; `harness:drain` exits as soon as nothing can be leased.
- `harness:ft-autopilot` and `harness:settle` are the task-queue aliases for the fully chained role loop.

## Product Autopilot Behavior

- `product-loop.mjs` is the open-ended product iteration path. It is not driven by one FT ticket.
- `product-loop-launcher.mjs` starts that loop as a detached background daemon so it can survive the launching shell.
- `desktop-smoke.mjs` is the desktop-only validation path for Electron shell, capture window, and real screenshot-capture service checks. It should be the first validation step for overlay or screenshot-chain bugs.
- It boots or reuses a live web surface, prompts Claude to use the actual product, find rough edges, fix the highest-value issue, re-test the flow, and then continue to the next small win.
- Each round writes a durable prompt pack, `session.log`, `claude.debug.log`, and `result.json` under `.harness/product-runs/<run-id>/`.
- Before every round it also rebuilds `.harness/state/product-memory.json` from historical `result.json` handoffs so the next prompt is driven by long-term memory instead of only the latest summary.
- The product loop now defaults to `--setting-sources local`, so unattended runs stay isolated from noisy user-level Claude hooks and plugins.
- The loop keeps going until Claude explicitly sets `continueAutopilot` to `false`, too many recoverable round failures accumulate, or you stop the process.
- The watchdog now detects stalled local Bash background tasks (for example, `TaskOutput` timing out while the task is still `running`), kills Claude's whole process group early, and lets the outer loop retry the next round instead of staying dead after one hung child.
- When a round writes mildly malformed JSON (for example JS-style `\'` escapes or raw control characters inside a string), the loop repairs those syntax issues before validating `result.json` so one nearly-correct handoff does not fake-fail the whole automation.
- If Claude exits without any valid `result.json`, the loop now auto-writes a durable fail handoff with `continueAutopilot: true` so unattended iteration can keep going instead of burning the whole loop on a fake-success exit.
- The prompt now carries forward open threads, recent wins, and a recent-file cooldown list so unfinished work gets continued while already-good areas are less likely to be churned again.
- If a round re-touches a file from the cooldown list, its `result.json` must include `revisitJustification` or the handoff is rejected as invalid.
- `harness:autopilot` now launches the product-iteration loop in detached background mode.
- `harness:autopilot:status` reports whether the detached loop is still alive.
- `harness:autopilot:stop` sends `SIGTERM` to the detached loop.
- `harness:desktop-smoke` launches the Electron app in a harness-enabled development mode, opens the capture window, simulates a real region-capture selection through the main process, and stores evidence plus a `result.json` under `.harness/desktop-smoke/`.
- `harness:product-loop` still runs the same loop in the foreground for debugging.
- The old FT queue autopilot is still available as `harness:ft-autopilot`.

## Operational Rules

- `feature_list.json` remains the stable feature inventory; the mutable execution queue lives in `.harness/state/tasks.json`.
- `init.sh` stays a repo re-entry helper. Orchestration belongs here, not in product runtime scripts.
- Existing functions, methods, and classes still require GitNexus impact analysis before editing, even when work is dispatched from this harness.
- Runtime queue state is generated from current `feature_list.json`; run `npm run harness:bootstrap` again after major feature-list changes.
- Worktree isolation is intentionally deferred until the repository has a real `HEAD`; `npm run harness:doctor` reports whether worktrees are currently eligible.
