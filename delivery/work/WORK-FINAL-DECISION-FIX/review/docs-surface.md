Your area: documentation and product surface.
Files: SKILL.md, README.md, README.en.md, CHANGELOG.md, docs/** (current
guides zh/en and the guide index), templates/v2/** and plugins/**.

Settle these questions:
- Every command, flag, action and output the changed docs mention exists
  and behaves as described in src/v2/cli/run.js and the runtime; the names
  match the table in work.md.
- The Skill's rows for a hand fix and for the merge decision tell a session
  how to take a fix at the merge decision in one line each, without
  changing unrelated rows; the runtime-version note says which runtime
  version these replies need.
- zh/en pairs of the approval and recovery guides state the same behaviour;
  the CHANGELOG `Unreleased` entry is accurate.
- This is a public, generic open-source project: no company, personal,
  host-specific or workspace-specific names, paths or ids appear in any
  changed text.
