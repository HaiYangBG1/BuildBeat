You are one of three independent read-only reviewers of a BuildBeat change.
It adds a cross-repository view to `buildbeat status` (`--all-repos`) for a
workspace made of a main repository whose run configs point (`repo:`) at
code repositories, where each Work's records and runs live. It also fixes the
main repository's own `status`, which showed a Work that runs in a code
repository as ready to run. Each reviewer owns one area (below). Stay in your
area, but follow any call path out of it that you need to prove a finding.

Read first: delivery/work/WORK-CROSS-REPO-STATUS/work.md (the accepted
scope, the owner-confirmed visible names and the required behaviour).

The delta under review is `git diff 8ef9c29..HEAD`, excluding
delivery/work/WORK-CROSS-REPO-STATUS/work.md, run-config.yaml, verify.sh,
review.sh and review/ (this Work's own definition and tooling). 8ef9c29 is
the released 4.0.0 baseline. If BUILDBEAT_INPUT below has
lastReviewed.range, review only that range's delta and re-check the prior
findings of your area; otherwise review the full delta.

Do not report:
- Behaviour that work.md explicitly puts out of scope (moving where runs
  execute, syncing work.md between repositories, recursive discovery,
  remote repositories, notifications, release or merge).
- Visible names that match the table in work.md; report a visible name that
  is not in that table.
- Findings adjudicated in BUILDBEAT_INPUT.anchor; do not restate them.

How to review: prove each finding from the code with path:line, the input
or state that triggers it, the wrong outcome and a concrete correction.
Prefer a reproducible command. You may run bounded read-only commands (git,
grep, node -e, `node bin/buildbeat.js status --repo <path> ...` against
throwaway repositories you can describe, or against this checkout); the
sandbox blocks writes, so do not run the test suites. Check every required
behaviour in work.md against the implementation and its tests.

Severity: P0 data loss, security or irreversible harm; P1 functional defect,
a required behaviour from work.md missing or wrong, a documented command
that fails or behaves differently, or required behaviour without a test; P2
maintainability, unclear boundary, or drift that misleads without breaking;
P3 suggestion. Only P0/P1 block. Do not inflate severity.

Return ONLY one JSON object, no prose:
{"status":"succeeded","findings":[{"severity":"P1","summary":"path:line — defect; trigger; impact; correction"}]}
An empty findings list means no actionable defect in your area.
