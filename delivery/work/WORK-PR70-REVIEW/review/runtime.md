Your area: runtime core.
Files: src/v2/engine/** (workflow.js, risk-preset.js, reducer.js),
src/v2/policy/policy.js, src/v2/runtime/** (orchestrator.js, decisions.js,
overview.js, notify.js, findings.js, run-record.js), src/v2/adapters/**, and
the removed src/v2/observe/** and src/v2/presets/** files.

Settle these questions:
- Fixed delivery graph: parseWorkflow accepts exactly the official legacy and
  core shapes; the edges match 3.3.1 for both; nothing becomes reachable that
  the old engine forbade, or the reverse.
- Frozen deliveryChecks: recorded at creation, compared on resume, used by
  approval. Find any path that approves, resumes, adopts or supersedes with
  weaker or missing checks, and comparisons that differ spuriously.
- Merge floor (evidencePresent, reviewClear, artifactAccepted): candidate
  binding, reused evidence, verify step naming, adjudication precedence over
  suppression, stale acceptance, unknown severities.
- Approval subject and plan digest binding for work.md and for intent/plan;
  refused approvals leave the ledger and decisions.jsonl unchanged.
- Event and record compatibility: 3.3.1 ledgers and run-records still reduce
  and display; new fields stay optional where old data lacks them.
- overview and notify: the stage machine for unified and legacy works,
  archived release records, and next-step commands that really exist.
