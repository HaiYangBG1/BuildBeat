# Evidence guide

[简体中文](06-evidence-guide.md) | **English**

Authority: [`RFC-0002 §4`](../RFC-0002-domain-model.md) (Chinese); implementation: `src/v2/evidence/collector.js`, `src/v2/observe/`. Core idea: **evidence is a fact the Runner read back, not a worker's account of itself**.

## The shape of an evidence record

Every piece of evidence enters the event ledger (`EVIDENCE_RECORDED`) with: `kind` (command / screenshot / drift / runtime-health / diagnosis / …), `subject` (candidate SHA or deployment unit), `digest` (sha256 of the raw log; the runtime may be deleted, the digest lives on), `status`, `grade`, producer, start and end times. Raw logs land in the runtime plane, `.buildbeat/runtime/`; the ledger and the compacted record reference only digests.

## Status: three values, fail-closed

| status | Meaning |
|---|---|
| `passed` | Zero exit code, no timeout, not killed by a signal |
| `failed` | Non-zero exit / timeout / signal |
| `unverified` | **Could not collect**: failed to start, data missing. Never means "no problem" |

`unverified` is never treated as a pass by any gate (three-valued logic, [Policy guide](03-policy-guide.md), Chinese). Fail-closed is kernel semantics, not a convention.

## Grades L0–L4

`L0` self-report → `L1` static check → `L2` real local execution (the default grade for command readback) → `L3` post-deployment verification → `L4` production readback. Gates state their requirement with `minGrade` (for example a merge floor of L2; closing a production switch needs L4).

**Verification pyramid warning (the most expensive lesson of the thirty-round campaign)**: the marginal value of polishing a lower layer toward theoretical completeness is far below moving one layer closer to the real machine one step earlier. In practice a 7,400-line L3 suite was polished to its limit, while the four real release blockers (systemd parsing behaviour, deployment/service identity split, probe budgets calibrated against a stand-in, TLS ref format) **were all structurally invisible to L3** and were found in one evening at L4. Rule of thumb: **move up a layer as soon as the simulated layer has zero real defect classes left; do not chase theoretical completeness**. Similarly, re-running the full verify when the candidate touched only a part is pure repetition; caching or trimming by content hash belongs to the envelope layer (the campaign measured 25 → 13 minutes) and the kernel does not do it for you: cache correctness depends on assumptions about a stable environment, which the envelope owner carries.

## Preflight is not evidence

`buildbeat preflight --config <run-config> --step <id>` dry-runs one step's worker command directly in the main checkout: no worktree, no ledger, no evidence of any kind (the output carries a `PREFLIGHT (dry signal, never evidence)` banner and the environment variable `BUILDBEAT_PREFLIGHT=1`). Its purpose is a minute-scale loop that reaches the first failure boundary before entering a Run (in the campaign every harness defect cost a whole Run round; preflight mode dismantled them in one evening). **Anything preflight finds counts only once a Run reproduces it.**

## Candidate scope

Evidence is bound to the candidate through `subject`: the merge gate counts only the current candidate's evidence; records from old candidates or old review rounds are not mixed in (a real-incident regression, see the `fix-loop` eval).

## observe: production joins the evidence plane (v0)

Frozen in [`RFC-0003 §8`](../RFC-0003-workflow-policy.md) (Chinese), implemented in M5 (`src/v2/observe/`):

- **Providers** (project probes such as drift checks and live status) produce records under the same Evidence Contract into a separate observe ledger (same chain verification, `.buildbeat/runtime/observe/`); a broken probe is `unverified` (default severity warn), never silent;
- **Three bands** (thresholds configurable, order fixed): `log` records only → `diagnose` triggers a read-only diagnostic command and produces `diagnosis` evidence → `intent` writes an Intent **draft** into the Git plane at `delivery/observe/intents/` (never executed automatically);
- **Human triage**: `observe triage --action fix_now|schedule|dismiss`. After `fix_now` a human carries it into a software-delivery Run and the loop closes; `dismiss` feeds the bands back so the same fingerprint is not queued again until its severity rises (alert-fatigue protection); the triage outcome is written into the draft file itself and survives deleting the runtime (invariant 23);
- **Scheduling boundary in v0**: the `schedule` field is parsed and recorded but there is no built-in scheduler; periodic runs are the host's cron calling `observe run` repeatedly.

## Completeness

`buildbeat metrics` prints evidence completeness (steps with evidence / steps that should have it); the M4/M5 exit line is ≥ 95%, the pilots measured 100%.

## Live readings are not evidence

> Since 2.0.0-beta.4 (iteration 08).
While a step runs, the Shell Adapter streams the worker's stdout/stderr to `.buildbeat/runtime/runs/<RUN>/<step>-<n>.{stdout,stderr}.live` and keeps a `live.json` (command, start time). These are **readings**: `status` uses them to answer "is it still moving, for how long, when was the last output", and they are reclaimed as soon as the step ends; the evidence log is still produced by readback, and the digest still binds the final log. Durations likewise: per-step elapsed time and the repository's historical median (`typical step duration` in `metrics`) are derived from ledger timestamps and enter neither the ledger nor the run-record.
