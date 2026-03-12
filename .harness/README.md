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
- If Claude exits non-zero, the supervisor immediately calls `fail` for the leased task so the queue does not sit on an expired lease.
- If Claude exits zero and the child agent wrote a valid `result.json`, the supervisor auto-applies `complete` or `fail` based on that handoff.
- If Claude exits zero but the handoff file is missing or invalid, the supervisor warns and preserves the lease so the operator can inspect the captured run log.
- `harness:watch` keeps polling forever; `harness:drain` exits as soon as nothing can be leased.

## Operational Rules

- `feature_list.json` remains the stable feature inventory; the mutable execution queue lives in `.harness/state/tasks.json`.
- `init.sh` stays a repo re-entry helper. Orchestration belongs here, not in product runtime scripts.
- Existing functions, methods, and classes still require GitNexus impact analysis before editing, even when work is dispatched from this harness.
- Runtime queue state is generated from current `feature_list.json`; run `npm run harness:bootstrap` again after major feature-list changes.
- Worktree isolation is intentionally deferred until the repository has a real `HEAD`; `npm run harness:doctor` reports whether worktrees are currently eligible.
