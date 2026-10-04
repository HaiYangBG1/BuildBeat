# Work acceptance and decisions

[简体中文](07-approval-guide.md)

New work has one work.md. accept binds its current digest but does not start execution; run continues within the user's authorization. Legacy intent/plan/spec acceptance records remain readable.

Status presents the transition, candidate, plan digest, evidence, reasons and next action. decide --action approve|reject must name the run and transition. Approval re-reads the candidate and frozen safeguards; changed subjects, dirty trees, missing evidence or unacceptable reviews cannot be stamped. Continue nonterminal decisions with run. Final approval means merge-ready only.

Use decide --action accept|dismiss --work ... --fingerprint ... for findings. Exact-fingerprint dismissals persist; similarity detects nonconverging reviews and never substitutes for adjudication.

Normal repairs continue automatically. Repeated issues, increased blockers, infrastructure failures and exhausted budgets create exception decisions. One budget grant covers its repair/reverification/review plan and can be replayed. The driving session cannot approve on behalf of the user without authorization.

Merging and releasing stay human actions. After a release, run `buildbeat release --config <config> [--note <text>]`: it checks that the Work's succeeded candidate is contained in `--ref` (default: the current HEAD), runs the read-only readback command from the run config's `release:` section in the main checkout (same shape, environment allowlist and redaction as a worker), and appends the outcome, exit code, commit, output digest and a redacted tail to `delivery/work/<ID>/releases.jsonl`. Once the latest readback has passed, close the window with `decide --repo . --work <ID> --action close --result <text>`, which records a close-work decision bound to that readback; a failed readback cannot close it.

Notifications report waiting, termination and stalls; they do not accept approvals. Webhook/DingTalk URLs come only from environment variables, and delivery failure does not affect the run. The watcher is an internal feedback mechanism.
