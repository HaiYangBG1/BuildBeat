# Work acceptance and decisions

[简体中文](07-approval-guide.md)

New work has one work.md. accept binds its current digest but does not start execution; run continues within the user's authorization. Legacy intent/plan/spec acceptance records remain readable.

Status presents the transition, candidate, plan digest, evidence, reasons and next action. decide --action approve|reject must name the run and transition. Approval re-reads the candidate and frozen safeguards; changed subjects, dirty trees, missing evidence or unacceptable reviews cannot be stamped. Continue nonterminal decisions with run. Final approval means merge-ready only.

These two merge-decision repair paths require a runtime containing this change (CHANGELOG `Unreleased`). Released 4.0 / 4.1.0 do not support them; a supporting release has not yet been identified. The package version alone does not establish support.

When a problem is found at the merge decision (`enter-wait-merge`), repair it within the same Run and verify and review again:

- Manual repair: commit in the Run worktree, then execute `buildbeat run --config <config> --run <RUN> --adopt <sha> --by <name>`. The worktree must be clean, the SHA must be its actual HEAD and a new descendant of the current candidate, and changes must stay within `allowedPaths`. Resume at verify, review incrementally from the previous candidate, then wait for another merge decision.
- Return to the fixer: execute `buildbeat decide --repo <repo> --run <RUN> --action fix --reason <what to repair> --by <name>`, then continue with `buildbeat run --config <config> --run <RUN>`. This is available only at the merge decision with a configured fixer; otherwise commit a manual repair and adopt it. The reason becomes an accepted P1 in the Work findings account and is passed in full to the fixer.

After either repair path returns to the merge decision, read `buildbeat status --repo <repo> --run <RUN>` and copy its refreshed approval command: `buildbeat decide --repo <repo> --run <RUN> --action approve --transition enter-wait-merge --candidate <full SHA from the card> --by <name>`. The candidate is filled in by status, inbox and notifications. Approval with the old candidate, or without a candidate after repair, fails with `approval stale`; read the new card before deciding.

The repair decision answers the old request and preserves historical evidence; the merge check uses only evidence for the current candidate. Returning to fix does not spend a review round, grant budget or refund it. Subsequent reviews count normally. SUCCEEDED Runs cannot be reopened; active 3.x Runs still require their original runtime.

Use decide --action accept|dismiss --work ... --fingerprint ... for findings. Exact-fingerprint dismissals persist; similarity detects nonconverging reviews and never substitutes for adjudication.

Normal repairs continue automatically. Repeated issues, increased blockers, infrastructure failures and exhausted budgets create exception decisions. One budget grant covers its repair/reverification/review plan and can be replayed. The driving session cannot approve on behalf of the user without authorization.

Merging and releasing stay human actions. After a release, run `buildbeat release --config <config> [--note <text>]`: it checks that the Work's succeeded candidate is contained in `--ref` (default: the current HEAD), runs the read-only readback command from the run config's `release:` section in the main checkout (same shape, environment allowlist and redaction as a worker), and appends the outcome, exit code, commit, output digest and a redacted tail to `delivery/work/<ID>/releases.jsonl`. Once the latest readback has passed, close the window with `decide --repo . --work <ID> --action close --result <text>`, which records a close-work decision bound to that readback; a failed readback cannot close it. A Work whose run configs have no `release:` section ends at the merge, and status says nothing is left to do.

Notifications report waiting, termination and stalls; they do not accept approvals. Webhook/DingTalk URLs come only from environment variables, and delivery failure does not affect the run. The watcher is an internal feedback mechanism.
