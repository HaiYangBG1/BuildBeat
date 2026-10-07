Your area: runtime and commands.
Files: src/v2/** and bin/buildbeat.js.

Settle these questions:
- Adopt at the merge decision: only while the run waits at the final
  decision; the worktree is clean; the sha is the worktree HEAD read back
  from Git; the new commit descends from the current candidate (no history
  rewrite); allowedPaths still applies; the decision is recorded as
  adopted, the candidate is re-pinned, and the run resumes at verify, then
  review (incremental when a reviewed candidate exists), then the merge
  decision again.
- The old candidate cannot be approved afterwards (stale approval), and the
  final approval binds the new candidate, its evidence and the accepted
  work artifact exactly as before.
- `decide --action fix --reason <text>`: only at the merge decision and only
  with a configured fixer (otherwise refused with a pointer to adopting a
  hand fix); the reason is recorded as an accepted P1 finding of the Work
  that the fixer receives; fix, verify and review follow and the run
  returns to the merge decision; it does not count as a review round and
  does not refund or consume budget beyond the steps that run.
- Review rounds keep counting toward reviewRoundsPerWork; convergence and
  budget stops behave as before; 3.x runs are refused as before; frozen
  safeguards cannot be weakened by either path; ledger compatibility holds.
- Status, the pending list and notifications offer both new replies with
  copyable commands (only the adopt route without a fixer).
