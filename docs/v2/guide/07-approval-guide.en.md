# Work acceptance and decisions

[简体中文](07-approval-guide.md)

New work has one work.md. accept binds its current digest but does not start execution; run continues within the user's authorization. Legacy intent/plan/spec acceptance records remain readable.

Status presents the transition, candidate, plan digest, evidence, reasons and next action. decide --action approve|reject must name the run and transition. Approval re-reads the candidate and frozen safeguards; changed subjects, dirty trees, missing evidence or unacceptable reviews cannot be stamped. Continue nonterminal decisions with run. Final approval means merge-ready only.

At the merge decision, `run --adopt`, `decide --action fix` and the approval command’s `--candidate` binding require runtime 4.2 or later.

When a problem is found at the merge decision (`enter-wait-merge`), repair it within the same Run and verify and review again:

- Manual repair: commit in the Run worktree, then execute `buildbeat run --config <config> --run <RUN> --adopt <sha> --by <name>`. The worktree must be clean, the SHA must be its actual HEAD and a new descendant of the current candidate, and changes must stay within `allowedPaths`. Resume at verify, review incrementally from the previous candidate, then wait for another merge decision.
- Return to the fixer: execute `buildbeat decide --repo <repo> --run <RUN> --action fix --reason <what to repair> --by <name>`, then continue with `buildbeat run --config <config> --run <RUN>`. This is available only at the merge decision with a configured fixer; otherwise commit a manual repair and adopt it. The reason becomes an accepted P1 in the Work findings account and is passed in full to the fixer.

After either repair path returns to the merge decision, read `buildbeat status --repo <repo> --run <RUN>` and copy its refreshed approval command: `buildbeat decide --repo <repo> --run <RUN> --action approve --transition enter-wait-merge --candidate <full SHA from the card> --by <name>`. The candidate is filled in by status, inbox and notifications. Approval with the old candidate, or without a candidate after repair, fails with `approval stale`; read the new card before deciding.

The repair decision answers the old request and preserves historical evidence; the merge check uses only evidence for the current candidate. Returning to fix does not spend a review round, grant budget or refund it. Subsequent reviews count normally. SUCCEEDED Runs cannot be reopened; active 3.x Runs still require their original runtime.

Use decide --action accept|dismiss --work ... --fingerprint ... for findings. Exact-fingerprint dismissals persist; similarity detects nonconverging reviews and never substitutes for adjudication.

Normal repairs continue automatically. Repeated issues, increased blockers, infrastructure failures and exhausted budgets create exception decisions. One budget grant covers its repair/reverification/review plan and can be replayed. The driving session cannot approve on behalf of the user without authorization.

Merging and releasing stay human actions. After a release, run `buildbeat release --config <config> [--note <text>]`: it checks that the Work's succeeded candidate is contained in `--ref` (default: the current HEAD), runs the read-only readback command from the run config's `release:` section in the main checkout (same shape, environment allowlist and redaction as a worker), and appends the outcome, exit code, commit, output digest and a redacted tail to `delivery/work/<ID>/releases.jsonl`.

Every work closes with a result page. Write `delivery/work/<ID>/result.md` from `templates/v2/result.example.md`: what was delivered and in which commit and version, what was decided, what is left and where it went, and what was written into the project's documents. Conclusions that later work needs go into the project's own documents first and are committed; result.md then records each one as `- <path> @ <commit> — <what was written>`. Close the work with `decide --repo . --work <ID> --action close [--result <text>] [--note <text>]`:

- A work with a release (a `release:` section in a run config, a readback already run, or a run config that cannot be read) closes only when its latest readback has passed, and the close decision is bound to that readback; a failed readback cannot close it. Any other work closes once result.md is there. No work closes while one of its runs is running or waiting for a decision.
- When the run config lives in a main repository and the work's records in a code repository, close from the main repository (with `--repo` naming the code repository): the runtime reads the main repository's configs whose `repo:` points at that code repository, and finds them from inside the code repository too when it sits in the main repository's folder. With no config in reach and runs recorded in the code repository, the close is refused.
- The runtime records the SHA-256 of result.md as `resultDigest`. Without `--result`, the summary is the first line of result.md that is neither empty nor a heading (code blocks and HTML comments are skipped).
- Every promotion line is checked: the commit is on the branch the main checkout is on (the branch status uses to call a candidate merged), it changes the file, and the file is outside the work's own folder. One failing line refuses the close and every problem is listed at once; lines that pass are recorded as `promotions`, and a page without such lines records an empty list.
- `status --work <ID>` checks the promotion lines live (✓/✗), before closing as well; when result.md changes after the close, status shows `result.md changed after closing`.

For a Work whose run configs have no `release:` section, status points at writing result.md once the candidate is merged.

Every decision records who made it and as what: `--by` gives the name, `--as human|agent` says whether a person or an AI session decided. Without `--as`, the runtime looks at where the command runs: inside an AI coding tool (it recognises `CLAUDECODE`, `AI_AGENT` and `CODEX_SANDBOX` / `CODEX_THREAD_ID`; other tools can set `BUILDBEAT_ACTOR=agent`) the decision is the AI session's and the name defaults to the tool; otherwise it is a person's and the name defaults to `git config user.name`, and without one you must pass `--by`. When an AI session passes on a decision you made in the conversation, it uses `--as human --by <your name>` and the record notes that it was entered from an AI session. `status --work <ID>` lists every decision, finding rulings included, with who made it, and `status --run <RUN>` lists that run's decisions; when the latest merge approval came from an AI session, status says so on its own line. Older records have no identity field: they show "identity not recorded" and are never guessed from the name. Accepting a work and closing it take `--note <text>` for the person's own words or reason; `status --work` shows it after that decision in its list.

Notifications report waiting, termination and stalls; they do not accept approvals. Webhook/DingTalk URLs come only from environment variables, and delivery failure does not affect the run. The watcher is an internal feedback mechanism.
