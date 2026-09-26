# Worker contract

[简体中文](05-worker-contract.md) | **English**

Authority: [`RFC-0003 §5`](../RFC-0003-workflow-policy.md) (Chinese; report B §8.1). A worker is a replaceable executor; the other half of the contract is always guaranteed physically by the Runner, never by the worker's good behaviour.

## General contract

- **Input**: the environment variable `BUILDBEAT_INPUT` (JSON): step, worker, run/work id, candidate (once pinned), allowed scope;
- **Output**: a step that needs a structured verdict writes a JSON envelope to the file named by `BUILDBEAT_OUTPUT`. The smallest valid example (matching the parser in `src/v2/runtime/orchestrator.js`; regression test `tests/v2-review-loop.test.js`):

```json
{
  "status": "succeeded",
  "findings": [
    {"severity": "P1", "summary": "The date filter misses the end-date boundary, so records from that day are dropped."}
  ]
}
```

  - `status`: `succeeded` | `failed` | `blocked`;
  - `findings[]` (optional; omitted means an empty array): each entry **must** have a `severity` (`P0` | `P1` | `P2` | `P3`) and a string `summary`; other fields are ignored and not recorded. A finding's fingerprint = severity + a normalised hash of `summary`, so `summary` should be stable and repeatable, without timestamps or random ids;
  - **Blocking semantics**: `P0` / `P1` block — `findings-blocking` routes to fix (with `reviewTriage: required` it first stops for a human to triage); `P2` / `P3` are only recorded as evidence, do not block and dispatch no fixer; a fingerprint that has been dismissed no longer blocks ([Approval guide](07-approval-guide.en.md));
  - **A format error is not a candidate defect**: one extra layer of markdown fences around the envelope (```json … ```) is tolerated; any other format (not JSON, not an object, a finding without `summary`, a severity outside P0–P3) = `invalid-output`, which since 2.0.0-beta.5 the kernel classifies as a worker infrastructure failure (kind `infra`): no fixer, no failure fingerprint, no budget charged, stop at `WAITING_HUMAN`; once the worker or environment is fixed, `approve --transition resume-<step>` continues;
- **What a worker says is not evidence**: the Runner trusts only facts it reads back itself (exit code, logs, git state); see the [Evidence guide](06-evidence-guide.en.md).

## Discipline per role

| Role | Write access | Key points of the contract |
|---|---|---|
| planner | The work directory | Produces intent/plan drafts; accepting them is a human, digest-bound act |
| builder | The isolated worktree (within `allowedPaths`) | Changes must land as git commits; an out-of-scope write = the Run BLOCKs and no candidate is pinned |
| verifier | Runs commands only | Runs the real tests; the exit code is the verdict; writes no envelope |
| fixer | Same as builder | The input is the last review's `findings[]` (with fingerprints and adjudication status; fix only accepted / open); when it is entered from a failed verify, the input carries **no** failure summary — the failed command / exit code / stdout / stderr are in the main checkout at `.buildbeat/runtime/runs/<RUN>/logs/verify-<attempt>.log`, and the prompt must say to read it ([template](../../../templates/v2/envelope/prompts/fixer.md)); a generic "check it again" is not accepted |
| reviewer | **None** (`readonly: true`) | Fresh-context and read-only; produces structured findings; any write to the worktree is caught by the snapshot comparison and recorded as a failure (invariant 9) |

## Failure and budget

A failed step is retried carrying its **failure fingerprint** (command + exit code + error summary + diff digest); the same fingerprint twice in a row, or going over `maxAttemptsPerStep` / the budget, stops and hands over to a human. The worker does not (and cannot) decide on its own to "try once more".

**No fixer configured does not mean automatic fixing**: when a role (commonly `fixer`) is missing from `workers:` in the run config, a Run that reaches that step neither errors nor skips it; it stops at `WAITING_HUMAN` (`enter-fix`, reason `no adapter configured for worker fixer; attended handoff`) and waits for a person. To get "fix automatically after a failing test", configure `fixer` (usually the same command as builder, with a prompt that reads the failure from `BUILDBEAT_INPUT`); see the [Quickstart](01-quickstart.en.md).

## Practical tips

- A ready-made wrapper script and three prompts are in [`templates/v2/envelope/`](../../../templates/v2/envelope/worker.sh): `worker.sh <role> -- <tool command…>` takes care of "exit 75 if the tool is not on PATH, append `$BUILDBEAT_PROMPT` as the last argument, commit mechanically after writing steps, write stdout to `$BUILDBEAT_OUTPUT` for read-only steps"; to switch tools, change only the command after `--`. The deterministic first-run regression is `tests/v2-templates-firstrun.test.js`, and the wrapper's shell contract is `tests/envelope-worker.test.sh`.

- Reference `delivery/work/<id>/plan.md` explicitly in the prompt, so the worker's goal is the very file whose digest was approved;
- The builder's commit can be done mechanically by the wrapper script (as in the M4 pilots: codex only edits files, and `git commit` happens in the wrapper);
- The reviewer's prompt asks for "the envelope JSON only", written to `$BUILDBEAT_OUTPUT` with `-o` / a redirect.

## Iteration 08: what the input gained

- `BUILDBEAT_PROMPT` (an environment variable, a file path) and `input.envelope` (`promptRef / file / digest / vars`): the prompt declared by `envelope:` in the run config has had its variables substituted by the kernel and been written to disk; the worker simply runs `cat "$BUILDBEAT_PROMPT"` instead of doing its own `git show`.
- `input.lastReviewed` (readonly steps only): `{candidate, run, evidenceRef, range}` — the candidate the last review saw and the `range` to the current candidate; a reviewer may review only the increment, but **settled verdicts must not be reopened** (`anchor` is still there).
- `input.findings` (writing steps) and `input.anchor` (readonly steps) are unchanged.

## Owner-visible names are not the worker's call

> Since 2.0.0-beta.4 (iteration 08).
Builders and planners tend to name things along the way: domains, service names, environment names, auto-stop durations, window durations. **Any name or parameter the owner will later see or say out loud is not an implementation detail but a decision for the gate**: put it in the intent, or collect it on the gate's decision card with a recommended value and the reason, and apply it only after a human approves. Real incident: a service named after an internal term took the owner four rounds of questions before it was renamed to a business name they understood. Say so in the prompt, and have the reviewer's checklist record "introduced an unapproved visible name" as P2.
