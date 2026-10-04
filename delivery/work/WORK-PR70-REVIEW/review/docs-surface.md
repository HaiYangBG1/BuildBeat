Your area: documentation and product surface.
Files: README.md, README.en.md, SKILL.md, CONTRIBUTING.md, CHANGELOG.md,
docs/** (zh/en guides, MIGRATION, CAPABILITY-MATRIX, RELEASING, docs/README,
RFC revision notes, files moved to docs/history), templates/v2/**,
example/** and plugins/**.

Settle these questions:
- Every command, flag, file name and configuration key that the current docs,
  Skill, templates and example tell a user to use exists in src/v2/cli/run.js
  and behaves as described. Check the parser and handlers, not the prose.
- zh/en pairs state the same commands, limits and defaults.
- Current documents that still present retired features as available, or
  link to files that moved to docs/history or were removed.
- Templates and example are consistent and would run: work.md shape, run
  config keys accepted by run-config-check.js, prompts that name the right
  artifacts, the worker.sh contract.
- Open-source hygiene: no company names, internal hosts or IPs, absolute local
  paths or personal identifiers in added text.
