# Workflow authoring guide

[简体中文](02-workflow-guide.md) | **English**

Authority: [`RFC-0003 §2`](../RFC-0003-workflow-policy.md) (Chinese); implementation: `src/v2/engine/workflow.js`. The official preset [`software-delivery.yaml`](../../../src/v2/presets/software-delivery.yaml) is the best model.

## Shape

```yaml
kind: workflow
version: 1
name: software-delivery
entry: intent
steps:
  - id: build
    worker: builder
  - id: review
    worker: reviewer
    readonly: true
  - id: wait-merge
transitions:
  - from: verify
    on: failed
    to: fix
terminal:
  - wait-merge
```

## Rules (checked fail-closed at load time)

1. **Step order is the default edge**: the order in which `steps` are written defines the happy path — each step's `succeeded` goes to the next step by default; a step that should not be on the default chain (such as `fix`) goes at the end and is reached only through explicit transitions.
2. **Explicit transitions**: `on` in `transitions` takes the worker's result (`succeeded` / `failed` / `findings-blocking`); an explicit edge takes precedence over the default one.
3. **`readonly: true`**: any write to the worktree by that step's worker makes the step count as failed and is recorded — "the reviewer does not change code" is invariant 9, enforced by the Runner's before/after snapshot comparison, not by trusting the prompt.
4. **`optional` / `requiredWhen`**: optional steps are skipped by default; `requiredWhen: ui-delivery` makes the step mandatory for a UI delivery (together with the [ui-render-gate](03-policy-guide.en.md) and invariant 22).
5. **`terminal`**: the listed steps are exits. The loader checks for **cycles without an exit** — a cycle such as verify ⇄ fix must have a path to a terminal step, or the workflow is refused.
6. **Steps without a worker** (such as `wait-merge`) are pure wait / decision points; the Runner raises `HUMAN_REQUESTED` there or stops according to `stopAt`.

## How it relates to the run config

`entry` in the run config can override the workflow's `entry` (for example to start at `build` and skip the intent/plan steps — the digests are still bound into the approval subject); `stopAt` names stop points. The whole workflow file is hashed with sha256 into `RUN_CREATED.workflowDigest`, so it can be proved afterwards which workflow a run used.

**What a mistake looks like**: `start` / `resume` / `doctor` / `preflight` / `approve --config` validate the whole run config before doing anything, and **list every problem at once**:

```text
error: run config delivery/work/WORK-X/run-config.yaml has 3 problem(s):
  - stopat: unknown key (did you mean stopAt?)
  - repo: required and missing
  - workers.reviwer: no step of the workflow uses this worker (did you mean reviewer?); workers in this workflow: planner, builder, verifier, reviewer, fixer
```

What is checked: required keys (`repo` `work` `run` `workflow` `workers`); unknown top-level keys and unknown worker / envelope fields (with the closest spelling); types and values (positive integers, lists, `inheritEnv` only `true` / `false`); every worker name must be used by a workflow step; `stopAt` / `entry` must be workflow steps; `work` / `run` may only contain letters, digits, `.` `_` `-`, and a numeric value must be quoted.

**Parallel runs (`parallel: true`, off by default)**: by default a repository drives one Run at a time, and another Work's `start` is refused with a note on whom it is queued behind (real incident: a session waited 3 hours 23 minutes behind another Work's Run).
A Work whose run config sets `parallel: true` can drive at the same time as other Works that set it too; Runs of the same Work are always mutually exclusive; a Run without the switch keeps the whole repository to itself as before — while it runs, parallel Runs cannot start, and while a parallel Run runs, it cannot start.
Before turning it on, make sure verify does not take fixed ports or share one database or other external state, or the parallel runs will collide. `doctor` prints the current mode; parallel markers left by a killed process are reclaimed by owner, like locks.

The run config can also declare (beta.3, all from real incidents in a thirty-round deployment campaign):

- **`requires:` environment contract** — the binaries and minimum versions the envelope implicitly depends on, checked fail-closed in full before the Run starts, with every problem reported at once (real incidents: `rg` present only on one session's vendored PATH, `/bin/bash` 3.2, a new shell resolving to Node 14 — each burned a whole Run before the real cause surfaced):

  ```yaml
  requires:
    - command: bash
      min: 4
    - command: rg
  ```

- **`reviewTriage: required` finding triage gate** — blocking review findings stop for a human to triage before a fixer is dispatched (see the [Approval guide](07-approval-guide.en.md)).

## Review round budget

Review rounds have a single cap: `budgets.reviewRoundsPerWork` (default 6), counted across every Run of this Work (see "Review rounds counted per Work" below). A review step without an explicit `maxAttempts` takes that value as its per-Run cap, so the per-Run cap never fires before the Work cap; at the cap the Run stops at `WAITING_HUMAN` with the reason stating that the budget is exhausted. `budgets.maxAttempts.review` in the run config still sets a separate per-Run cap. (The official preset used to carry the campaign charter's "at most 2 review rounds per Run", which made a Run that needed two or three ordinary fix rounds ask for an extension again and again, and two caps had to be lifted together.)

**Stop on non-convergence**: below the cap, each time review reports blocking findings, before a fixer is dispatched, the kernel compares this round's P0/P1 findings with the earlier rounds of this Run. If a finding comes back after it was already sent to a fixer (same fingerprint; dismissed ones do not count), or this round has more blocking findings than the last one, the Run stops at `enter-fix` (kind `review-not-converging`) and the reason names the returning fingerprints or the two counts. Approving means fix + re-verify + one more review round and leaves the budget alone; `findings adjudicate --action dismiss` first stops a finding that should not block. While every blocking finding is new and there are no more of them than last round, the loop continues without asking anyone. With `reviewTriage: required` the triage stop happens as before and carries the non-convergence reason; at the cap the stop is still `budget`, with the same reason added.

For the `resume-<step>` a Run stops at once the budget is exhausted, **a human approval grants one more attempt**: the kernel records a `BUDGET_EXTENDED` (a ledger fact, replayable), raises that step's limit by one and runs it; a rejection ends the Run. Before this, approving only made the same request come straight back (two pilot app-login Runs ended CANCELLED because of it, although their candidates were already in production).

The run config can override the preset (run config > preset > global `maxAttemptsPerStep`):

```yaml
budgets:
  maxAttempts:
    review: 3
    verify: 6
  reviewRoundsPerWork: 6   # review rounds counted across every Run of this Work (superseded ones included); see the overview guide
```

`doctor` prints each step's effective limit and where it comes from (run config / workflow preset / default).

**Review rounds counted per Work (iteration 09)**: a per-Run budget cannot stop "a new Run for every round" — one pilot Work ran 21 Runs and 9 review rounds without the 2-round cap ever triggering. `budgets.reviewRoundsPerWork: N` (N = 6 when unset) makes the kernel count, before a review step starts, the review rounds of **every** Run of this Work (superseded ones and ones already compacted into a run-record included); at N it stops at `WAITING_HUMAN` (kind `work-review-cap`, transition `enter-review`): approving grants one more review round (ledger `BUDGET_EXTENDED scope=work`), rejecting means merging or closing on the evidence at hand. Each Work in `overview` gets a line `cost: review rounds · findings · human waits · worker time`, and the run-record carries a `cost` block — read that line before deciding "continue or cut"; the stop-loss line in the intent (at most so many Runs / review rounds / hours) is checked against it.

## Worktrees live inside the repository: keep `.buildbeat/` out of test collection

> Since 2.0.0-beta.5 (iteration 09).
A Run's isolated worktree is `<repo>/.buildbeat/worktrees/<RUN>/`, and the runtime ledgers are in `<repo>/.buildbeat/runtime/`. Neither enters git (the template `.gitignore` excludes them; tools that honour `.gitignore`, such as `rg` and `gitleaks`, no longer walk into them), but **test frameworks collect tests from the file system**: after a pilot merge, the mainline vitest also ran the old candidates' tests in leftover worktrees, and the noise lasted until `gc`. Add to the project:

- vitest: `test.exclude: ['**/node_modules/**', '**/.buildbeat/**']`
- jest: `testPathIgnorePatterns: ['/node_modules/', '/.buildbeat/']`
- pytest: `norecursedirs = .buildbeat`
- Maven / Gradle only collect `src/**` and are unaffected; point Playwright's `testDir` at a specific directory.

When `start` is refused with "another run is active", the CLI now prints the Run holding the lock, the step it is at, how long ago its last event was, and a copyable `status` command. By default a repository still drives one Run at a time; since 3.2.0, Works whose tests do not compete for ports or databases can set `parallel: true` in their run config and drive in parallel (see "Parallel runs" above).

## Infrastructure failures and candidate defects are counted apart

> Since 2.0.0-beta.5 (iteration 09).
A worker's timeout, crash or non-envelope output, and a worker that deliberately ends with exit code **75** (the convention: verify / a wrapper script that finds the environment unsatisfied — a command not on PATH, a port taken, a backend 404, a sandbox forbidding listening — exits 75), are all classified by the kernel as `infra`: `STEP_FINISHED.data.infra = true`, no failure fingerprint, no fixer, the step's budget is not charged (refunded through `steps[step].infraAttempts`), and the Run stops at `WAITING_HUMAN` (kind `infra`). A human approving `resume-<step>` reruns it; a rejection ends it. Any other non-zero exit is still a candidate failure and takes the `on: failed` edge.

A failure with no transition edge (`failed` of build, review and fix in the preset) is no longer terminal either: the Run stops at `resume-<step>` for a human to decide. The only terminal FAILED left is a policy `BLOCK`.

## Run config sections added in iteration 08

- **`envelope:`** — `prompts:` (a directory, relative to the run config) + `vars:` (`{vars.x}` substitution) + optional `pin: <sha>` (read the prompts from that commit, freezing the envelope). The kernel takes the prompt `<component>-<worker>.md` → `<worker>.md`, writes it to `runs/<RUN>/prompts/<step>-<n>.md`, and hands it to the worker as `BUILDBEAT_PROMPT` (the path) and `input.envelope` (`promptRef / file / digest / vars`); worker args may use `{prompt}` and `{vars.x}`. `RUN_CREATED` records the `envelopeDigest`.
- **`start --attempt new`** — `run:` names the family (`RUN-X`) and the kernel numbers it `RUN-X-01/02…` (scanning the runtime plane and the Git-plane run-records, so deleting the runtime does not reuse a number); older waiting Runs of the same Work are superseded automatically ([Approval guide](07-approval-guide.en.md)).
- **`cache:`** — `verify: tree`: a verify with the same `HEAD^{tree}` + the same worker command + the same envelope digest that **already passed** reuses its evidence (ledger `reused`, `status` marks `(reused from RUN-X)`); failures and dirty trees are never reused. Do not turn it on for a project whose verifier depends on things outside the tree (remotes, time).
- **Incremental review** — the input of a readonly step carries `lastReviewed {candidate, run, evidenceRef, range}` (the candidate of this Work's latest review, when it is an ancestor of the current candidate); the reviewer prompt may ask to review only the diff within `range`, with anchored verdicts as before (`anchor`).
- **`redact:`** — a list of regular expressions; evidence logs are replaced with `<REDACTED>` before they are written; the digest binds the redacted text. Live streams (`.live`) are not redacted and are deleted when the step ends.
- **`probe:` entries in `requires:`** — `probe: <shell command>` + optional `expect: <regex>` + `name:`; a non-zero exit or a non-matching output fails closed, reported together with the binary version items. Turn environment facts you ran into (Redis ≥ 7, the target machine's Python version, a reachable port) into probes so the next window does not rediscover them; narrative facts go in `delivery/work/<ID>/env-facts.md`.
- **Step `grade:`** — a workflow step can declare the grade of its command evidence (L0–L4, default L2).

## The release readback lane: `release-readback` + `riskPreset: release`

The kernel has no deployment capability (invariant 20); production actions are always a human's. This lane only records the **readbacks** before and after the action as L4 ledger entries: `preflight` (read-only checks before the action) → stop at `enter-apply-readback` (the human performs the action) → `apply-readback` (proves the action took effect) → `observe` (proves health) → `wait-close` (the human closes the window). All three readback steps are `readonly`, `grade: L4`, `maxAttempts 1`: any failing step stops for a human; there is no fix edge. The risk preset `release` provides `stopAt: apply-readback` and the window-closing evidence gate (L4 command evidence). The worker is any readback script (curl a health endpoint, read a version, compare a config fingerprint), and its exit code is the verdict. The forty hand-made readback commits of a pilot project's release day are exactly what this lane is for.

## Change discipline

The preset is part of the product: before changing `software-delivery.yaml`, first ask whether this is a project difference — a project difference uses its own workflow file (point the run config's `workflow:` at it) and leaves the official preset alone. The schema is additive-only; a breaking change bumps `version`.
