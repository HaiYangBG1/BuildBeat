# Recovery and diagnostics

[简体中文](10-recovery.md)

These two merge-decision repair paths require a runtime containing this change (CHANGELOG `Unreleased`). Released 4.0 / 4.1.0 do not support them; a supporting release has not yet been identified. The package version alone does not establish support.

- run resumes the unique nonterminal run in its family; choose --run when ambiguous. Archived work needs explicit --new to start another attempt.
- An interrupted step reruns itself from the ledger. Handle a dirty worktree first. After committing a manual fix, --adopt checks the actual HEAD and continues at verify.
- The merge decision also accepts a manual repair: the new HEAD must descend from the candidate and stay in scope. Alternatively use `decide --action fix --repo <repo> --run <RUN> --reason <what to repair> --by <name>` with a configured fixer, then `run --config <config> --run <RUN>`. Both paths verify and review again before another merge decision, preserving review budgets and historical evidence.
- After repair, read the refreshed status card and copy its approval command with `--candidate <full SHA>`; old or unbound approvals fail with `approval stale`.
- Reclaim a lock only when its owner is on this host and provably dead. Keep live, foreign-host and unidentified locks. stop is not a process-kill command.
- Timeouts, crashes, malformed envelopes and exit 75 are infra: no fixer and no failure-budget charge. Decide and continue once the environment recovers.
- A corrupt ledger exposes only its valid prefix and refuses appends. history --verify replays and validates without silently repairing it. Preserve the scene and candidate.
- Changed workflow digests or frozen safeguards prevent resume. Unsupported old custom/release flows must finish on the old runtime.
- Terminal records survive runtime cleanup; active process/worktree state does not migrate through Git. Do not routinely delete runtime files.
- gc plans first and only collects compacted terminal runs. Dirty trees and unique candidates are retained by default; stale lock owners must be proven dead.
- STALLED defaults to 15 minutes without output. Status shows elapsed/typical duration and recent output; it does not kill processes.

[Migration and rollback](../../MIGRATION.md).
