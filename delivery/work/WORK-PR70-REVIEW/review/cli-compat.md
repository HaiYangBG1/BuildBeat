Your area: CLI and compatibility.
Files: src/v2/cli/run.js, src/v2/cli/run-config-check.js, bin/buildbeat.js,
templates/v2/run-config.example.yaml, with docs/MIGRATION.md as the contract.

Settle these questions:
- run: the start-or-resume decision (run families, exact ids, archived
  records, corrupt ledgers, --new/--run/--adopt combinations, parallel locks)
  and the start-time check of the committed work artifact (base resolution,
  Git checkout filters, missing file, a base other than HEAD).
- status, decide, check, history and every legacy alias (start, resume,
  inbox, overview, approve, reject, accept, doctor, preflight, events, replay,
  metrics, findings, watch): which handler runs, which flags are honoured,
  exit codes, and any legacy flag that silently changes meaning.
- Legacy inputs: 3.3.1 run configs (with and without workflow, riskPreset,
  entry, policies, budgets.maxAttempts, cache, envelope, requires, stopAt),
  official workflow files (legacy and core, with comments) and 3.3.1 ledgers
  (running, waiting, terminal, superseded). For each, compare what 4.0 does
  with what docs/MIGRATION.md promises.
- Error paths: retired commands and configurations fail before any side
  effect (no ledger, worktree, lock or decision written), and every message
  points to a real next step.
