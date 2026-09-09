# Quickstart: your first Run

[简体中文](01-quickstart.md) | **English**

Goal: in a real Git repository, let the Runner drive Build → Verify → Review to completion and **stop at the merge decision**, which you make with the evidence in front of you. The order is fixed: install → prepare the Work → write the run config → accept the plan → doctor → start → read the evidence and decide. Every step says what success looks like. How long it takes depends on your workers and the task; this page promises no numbers.

> People who use BuildBeat inside an AI session never type these commands: `SKILL.md` §0.5 is the driving manual the session reads, and you just say "start", "where are we", "approve". This page shows what runs behind the session so you can check it.

## 0. Install

```bash
npm install --global @haiyangbg/buildbeat@latest
buildbeat | head -3    # printing "BuildBeat runtime" plus the usage means the install worked
```

Stable releases live on `@latest`; there is exactly one executable, `buildbeat` (the runtime this page uses). `@next` is only for pre-releases. Requirements: Node ≥ 20, Git, bash, zero runtime dependencies.

> Before continuing, confirm that `$(npm root -g)/@haiyangbg/buildbeat/templates/v2/envelope/` exists. If it does not, reinstall with `npm install --global @haiyangbg/buildbeat@latest`.

## 1. Prepare the Work (Git plane)

In the target repository, create the Work directory and write the intent and the plan (their digests get bound into the approval subject), copy the official workflow preset next to the Work (copy, do not reference the install directory: the workflow file's digest is recorded in the Run and travels with the project in Git), then copy the envelope templates (worker wrapper script plus three prompts) into the repository-level `delivery/envelope/`:

```bash
BB="$(npm root -g)/@haiyangbg/buildbeat"
mkdir -p delivery/work/WORK-DEMO-1
printf "# Intent\nAdd date filtering to the CSV export.\nStop-loss: at most 3 Runs, 4 review rounds.\n" > delivery/work/WORK-DEMO-1/intent.md
printf "# Plan\n1. Add from/to parameters in src/export.js; 2. add boundary cases under tests/.\n" > delivery/work/WORK-DEMO-1/plan.md
cp "$BB/src/v2/presets/software-delivery.yaml" delivery/work/WORK-DEMO-1/workflow.yaml
cp -R "$BB/templates/v2/envelope" delivery/envelope
git add delivery && git commit -qm "buildbeat: work WORK-DEMO-1 + envelope"
```

The envelope must be committed: workers run in an isolated worktree and only see committed files. `delivery/envelope/worker.sh <role> -- <tool command…>` takes care of "exit 75 when the tool is not on PATH, append the prompt as the last argument, commit mechanically after a writing step, capture stdout as the envelope for a read-only step"; the three prompts only need the project's environment facts added ([Worker contract](05-worker-contract.md), Chinese).

## 2. Write the run config

`delivery/work/WORK-DEMO-1/run-config.yaml`. Paths resolve relative to **this file**; the YAML is a strict subset: block lists and block maps only, no inline `[]` / `{}`, no anchors, comments on their own line. The config below parses as-is (machine-checked by `tests/v2-templates-firstrun.test.js`); the full sample and the envelope templates are in [`templates/v2/`](../../../templates/v2/run-config.example.yaml).

```yaml
repo: ../../..
work: WORK-DEMO-1
run: RUN-DEMO
workflow: workflow.yaml
riskPreset: standard
entry: build
allowedPaths:
  - src
  - tests
reviewTriage: required
envelope:
  prompts: ../../envelope/prompts
workers:
  builder:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - builder
      - --
      - codex
      - exec
      - -s
      - workspace-write
  verifier:
    command: bash
    args:
      - -lc
      - npm test
  reviewer:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - reviewer
      - --
      - codex
      - exec
      - -s
      - read-only
  fixer:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - fixer
      - --
      - codex
      - exec
      - -s
      - workspace-write
```

- `workers.<role>` is any CLI: to switch tools, change only what follows `--` (`claude -p`, any script), see the [Adapter guide](04-adapter-guide.md) (Chinese); the reviewer's output format is in the [Worker contract](05-worker-contract.md) (Chinese) and already spelled out in the prompt template.
- **`fixer` is not optional**: without it, a failed verify or a blocking review stops the Run at `WAITING_HUMAN` (reason `no adapter configured for worker fixer`) waiting for you to fix by hand; nothing gets fixed automatically.
- Worker subprocesses receive only `PATH HOME LANG LC_ALL TMPDIR TERM USER SHELL` by default; inject anything else by name with `env:` ([Adapter guide](04-adapter-guide.md), Chinese).
- `reviewTriage: required` routes P0/P1 findings through you before a fixer is dispatched; delete the line if you do not want that.

## 3. Accept the plan

The `standard` preset requires the plan to be an accepted artifact before build (`controlled` also requires the intent). Acceptance is digest-bound: edit the plan after accepting it and the acceptance expires on its own; `doctor` reports `stale`.

```bash
buildbeat accept --repo . --work WORK-DEMO-1 --artifact plan --by <your name>
```

Success: it prints `accepted plan as A-WORK-DEMO-1-<n>` and `digest: sha256:…`.

## 4. doctor: read what start will read, before starting

```bash
buildbeat doctor --config delivery/work/WORK-DEMO-1/run-config.yaml
```

Check section by section: declared versus actual enforcement for each entry under `policies`; whether each worker under `worker isolation` is `env allowlist` or `WARNING inherit`; `push protection`; the per-step budgets; under `work artifacts`, whether intent and plan exist, are accepted, are stale, and the preview of where `start` will stop. A `WARNING` does not mean you cannot run, but you should know what it means; exit code 0 does not mean everything is ready.

## 5. Start the Run; it stops for a human

```bash
buildbeat start --config delivery/work/WORK-DEMO-1/run-config.yaml --attempt new
```

`--attempt new` numbers the run automatically (`RUN-DEMO-01/02…`) and supersedes older Runs of the same Work that are still waiting for a human. The Runner will: open an isolated worktree (branch `run/RUN-DEMO-01`, pushing to the configured remote is blocked) → the builder produces a commit and the candidate is pinned → the verifier really runs the tests (the exit code is read back as evidence) → the reviewer produces structured findings read-only → the Run reaches `WAITING_HUMAN`.

When starting from inside an AI session, detach the process (`nohup` / `setsid`); otherwise the host session's timeout kills the Run.

**What success looks like**: the output ends with `status: WAITING_HUMAN`, and `waiting on human:` is followed by `enter-wait-merge` (the merge decision) or `enter-fix` (triage). **Stopping with `infra` is an environment problem, not a code problem**: timeouts, crashes, non-JSON envelopes and exit code 75 all count; fix the worker or the environment, then `approve --transition resume-<step>` to continue. No budget is consumed.

## 6. Read the evidence, decide

```bash
buildbeat overview --repo .                       # where each Work is, whose move is next, what it has cost
buildbeat inbox --repo .                          # Runs waiting for you, each with the copyable next command
buildbeat status --repo . --run RUN-DEMO-01       # steps, durations, evidence, findings, the reason it waits
```

Before approving, look at: the candidate SHA, the verify exit code and log, every review finding. Then run the line `inbox` gives you, usually:

```bash
buildbeat approve --repo . --run RUN-DEMO-01 --transition enter-wait-merge --by <your name> --config delivery/work/WORK-DEMO-1/run-config.yaml
```

**Be clear about which step you are approving** ([Approval guide](07-approval-guide.en.md)): `enter-wait-merge` is the merge decision; the Run reaches the terminal state `SUCCEEDED`, meaning the candidate is fit to merge. The actual merge, push and release are always your actions outside the Runner. `enter-fix` / `resume-<step>` are non-terminal transitions: after approving them, `resume --config …` lets the Run continue. When findings block, the Run routes fix → verify → review on its own; when the budget is exhausted or a failure fingerprint repeats, it stops and hands back to you ([Recovery](10-recovery.en.md)).

## 7. Walk the failure branch once

To see the automatic repair loop, commit a failing test case under `tests/` and `start --attempt new` again: verify fails → the fixer repairs with the failure summary → verify reruns → review. `status` shows `step fix: SUCCEEDED` and a second `verify`. To route findings through your hands first: `reviewTriage: required` together with `findings list` / `findings adjudicate` adjudicates fingerprint by fingerprint; a dismissed fingerprint no longer blocks.

## 8. Recovery, notifications, cleanup

- Process killed / machine rebooted: `resume --config <run-config.yaml>`, see [Recovery](10-recovery.en.md).
- You fixed the problem yourself in the worktree and committed it: `resume --config … --adopt <sha> --by <name>` skips the fixer and continues from verify.
- Not watching the screen: configure one DingTalk / webhook channel in `.buildbeat/notify.yaml` (the URL comes only from an environment variable) and the Run finds you when it stops ([Approval guide](07-approval-guide.en.md)).
- Worktrees left by terminal Runs: `gc --repo .` prints the plan first, `--apply true` cleans.
- To dry-run a single step before a real Run: `preflight --step <id>` (main checkout, minute-scale, produces no evidence); declare the envelope's environment dependencies with `requires:` so they are checked fail-closed before start ([Workflow guide](02-workflow-guide.md), Chinese).

## 9. observe: let the system watch production (v0)

```bash
cp "$(npm root -g)/@haiyangbg/buildbeat/src/v2/presets/observe.yaml" .buildbeat/observe.yaml   # replace with the project's real probes
buildbeat observe run --config .buildbeat/observe.yaml            # one invocation = one cycle; leave scheduling to cron
buildbeat observe status --repo .
buildbeat observe triage --repo . --intent delivery/observe/intents/INTENT-<fp>.md --action fix_now --by <you>
```

A probe fails or cannot collect → evidence `failed` / `unverified` → bands escalate (record → read-only diagnosis → Intent draft queued). Drafts are **never executed automatically**; `dismiss` feeds the threshold back so the same fingerprint stays quiet until its severity rises. Details in the [Evidence guide](06-evidence-guide.en.md) §observe.
