Your area: documentation and product surface.
Files: SKILL.md, README.md, README.en.md, CHANGELOG.md, docs/** (current
guides zh/en, MIGRATION, CAPABILITY-MATRIX, guide index), templates/v2/**,
example/** and plugins/**.

Settle these questions:
- Every command, flag, configuration key, environment variable and file the
  changed docs mention exists and behaves as described in src/v2/cli/run.js
  and the runtime; the names match the table in work.md.
- The governance-template rationale is corrected everywhere it appears in
  current documents, without rewriting dated history.
- The without-runtime page states what a person or tool may read and write,
  the exact record formats the runtime later accepts, and what they must
  not claim; zh/en say the same; the Skill line and the guide index point to
  it.
- zh/en pairs of every changed guide state the same behaviour; no current
  document still describes observe or the release lane as available.
