Your area: documentation and product surface.
Files: SKILL.md, README.md, README.en.md, CHANGELOG.md, docs/** (current
guides zh/en and the guide index), templates/v2/** and plugins/**.

Settle these questions:
- Every command, flag and output the changed docs mention exists and
  behaves as described in src/v2/cli/run.js and the runtime; the names match
  the table in work.md.
- The Skill's row for taking over / checking progress tells a session when
  to use `--all-repos` (a main repository whose run configs point at other
  repositories) in one line, without changing the other rows.
- zh/en pairs of every changed guide state the same behaviour; the
  CHANGELOG `Unreleased` entry describes the user-visible change and the
  single-repository fix accurately.
- This is a public, generic open-source project: no company, personal,
  host-specific or workspace-specific names, paths or ids appear in any
  changed text; examples use generic labels.
