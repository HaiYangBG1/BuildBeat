# Recovery handbook

[简体中文](10-recovery.md) | **English**

Design premise (invariant 23 in [`V2-PLAN.md`](../../V2-PLAN.md), Chinese): **the whole `.buildbeat/runtime/` directory can be deleted at any time**. Accepted artifacts, decisions, Intent drafts with their triage, and the compacted records of finished Runs all live in the Git plane. "Delete and rebuild" is the default troubleshooting move, not the last resort.

## Symptom → action

### The ledger reports corrupted

`status`/`inbox` shows `LEDGER CORRUPTED after seq=N (<reason>)`: the ledger truncates its view at the last valid event and **refuses to append**; recovery is a human decision, nothing is repaired silently.

1. `buildbeat events --repo . --run RUN-X` shows the valid prefix; `replay` verifies the reduction;
2. If the broken Run is in flight: usually abandon it (the candidate in the worktree is still readable on its branch) and start a new Run;
3. If someone edited the ledger file by hand: rebuild the judgement from Git-plane facts; do not patch event lines by hand.

### The Run process was killed / the machine rebooted

```bash
buildbeat resume --config <run-config.yaml>
```

The in-flight step is closed as `crashed` (the fact is recorded), then **the step itself is rerun** (changed in beta.3): a dead process says nothing about the candidate; the lost attempt still counts against the step's budget, and an exhausted budget stops for a human. The earlier semantics treated a crash as a step failure and followed the failure edge; real incident (deploy-18): the host tool's timeout killed the verify worker, the crash was routed to fix, and the fixer burned a round facing zero verifier evidence. A dirty worktree still stops for a human first. Resuming with approvals re-checks candidate/plan freshness and turns `APPROVAL_STALE` over to a human if anything changed. If it cannot be recovered, delete the runtime and rerun: the candidate branch and the Git-plane records are not lost.

**Launch discipline** (the other half of the same incident): a Run longer than minutes must be launched in a way that escapes the host tool's timeout (`nohup`/`setsid`); `start` prints this reminder in an interactive shell.

### A stuck lock ("another run is active")

A Run that exited abnormally may leave the repository lock behind. Once you have confirmed that no Run is really active:

```bash
buildbeat stop --repo . --run RUN-X --reason "crashed; releasing lock"
```

`stop` records the terminal state and the reason; for a mere leftover lock you may also delete `.buildbeat/runtime/` and start over.

### Abnormal worker behaviour

- **Worker infrastructure failure (iteration 09)**: a timeout, a crash, output that is not an envelope (`invalid-output`), or the worker ending itself with exit code **75** (`EX_TEMPFAIL`, "environment unavailable"): the kernel classifies it as `infra`: no failure fingerprint is recorded, no fixer is dispatched, **the step's budget is not consumed**, the Run stops at `WAITING_HUMAN` (kind `infra`, transition `resume-<step>`), notifications go out as usual. Once the backend is back, `approve --transition resume-<step>` reruns the step; `reject` ends the Run. Real incidents: a worker backend returning 404 and non-JSON output killed five Runs in two days while the driving session hand-wrote a probe every two minutes; a missing rg on PATH, a port collision and a host load of 280 each dispatched a fixer.
- **A failure with no transition edge** (such as `failed` on build / review / fix in the preset) no longer ends in FAILED; it stops at `resume-<step>` as well, and a human decides whether to rerun or end.
- Out-of-scope writes → the Run BLOCKs and no candidate is pinned: check `allowedPaths` and the scope declared in the worker prompt;
- Timeouts → first check whether it is the environment (`infra` already stopped for you), then adjust `timeoutMs`; an exhausted budget is a brake, not a fault: approve `resume-<step>` to grant one more attempt, or narrow the scope.

### The observe plane

- A probe stays `unverified`: fix the probe's reachability first; unverified means "could not collect", not "no problem";
- False alarms flooding: `observe triage --action dismiss`; the same fingerprint stays out of the queue until its severity rises;
- Observe cycle counts reset to zero after the runtime was deleted: normal; triage memory lives in the Git-plane drafts, and suppression keeps working (tested).

### Everything is a mess

```bash
rm -rf .buildbeat/runtime/
```

Then start again from the Git plane. Any phenomenon where a long-term metric or a terminal-state explanation depends on the runtime is a bug; please report it.

## Diagnostic entry point

`buildbeat doctor --config <run-config>`: the config parses, the workflow has no exit loop, adapter env posture, digests can be computed, supersede and stall thresholds, whether the notification channel and its environment variable are in place. `events`/`replay`/`metrics` are all read-only and can run at any time.

## "Is it stuck?"

> Since 2.0.0-beta.4 (iteration 08).
Look at `buildbeat status --repo . --run <RUN>` first: the step in flight shows elapsed time, the repository's historical median, the worker command, how long ago the last output was and its last three lines. No output beyond the threshold (default 15 minutes, `--stall-after <minutes>` or `stallAfterMs` in the run config) marks `STALLED`: **marked, never killed**. How to judge:

- Output keeps coming → wait (compare against `typical` to see whether it is far beyond the median);
- STALLED and the worker is an agent CLI → most likely a long reasoning stretch or waiting for an interaction that never comes; `stop --reason`, then rerun by the crash recovery path (the interrupted step reruns itself);
- STALLED and the worker is a script → read the last three lines; usually it waits on an external resource (port, lock, network).

To avoid watching the screen, subscribe to `STALLED` notifications ([Approval guide](07-approval-guide.en.md)). `watch --repo . --run <RUN> --once true` probes once by hand.

## Cleanup: gc

> Since 2.0.0-beta.4 (iteration 08).
Terminal Runs leave worktrees, `run/*` branches and the occasional lock. `buildbeat gc --repo .` prints the plan by default, `--apply true` executes it:

- It touches only Runs that are **terminal and already compacted into a run-record** (the Git plane must have the record before the runtime plane is touched);
- Worktrees may be deleted (the commits are on the branch); a dirty worktree is left alone without `--force true`;
- A branch is deleted only when the candidate **is reachable from another ref** (merged / tagged / on the remote) or the Run produced no candidate; otherwise it reports "reachable only from this branch, kept": that branch is the last thread to the evidence;
- Leftover `locks/<RUN>.lock` of terminal Runs are cleaned; the `active-run` lock is still handled by hand as above.

gc never writes to the ledger (after the terminal state only `RUN_COMPACTED` is allowed), so it can run at any time and repeatedly.
