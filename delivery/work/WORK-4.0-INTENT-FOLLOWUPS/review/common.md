You are one of three independent read-only reviewers of a BuildBeat change.
It implements four owner decisions before the 4.0 release: an opt-in
screenshot evidence requirement, a lightweight release readback and
closeout, a corrected rationale for the retired governance templates, and a
one-page compatibility guide for working without the runtime. Each reviewer
owns one area (below). Stay in your area, but follow any call path out of it
that you need to prove a finding.

Read first: delivery/work/WORK-4.0-INTENT-FOLLOWUPS/work.md (the accepted
scope, the owner-confirmed visible names and the required behaviour) and
delivery/work/WORK-PR70-REVIEW/review-summary.md (why these decisions exist).

The delta under review is `git diff f308744..HEAD`, excluding
delivery/work/WORK-4.0-INTENT-FOLLOWUPS/run-config.yaml, verify.sh, review.sh
and review/ (this Work's own tooling). f308744 is main with the 4.0
simplification merged; its behaviour is the baseline. If BUILDBEAT_INPUT
below has lastReviewed.range, review only that range's delta and re-check
the prior findings of your area; otherwise review the full delta.

Do not report:
- Retirements already decided in docs/MIGRATION.md (observe, the release
  lane, policy and workflow authoring, governance templates) unless this
  change breaks a promise around them.
- Visible names that match the table in work.md; report a visible name that
  is not in that table.
- Findings adjudicated in BUILDBEAT_INPUT.anchor; do not restate them.

How to review: prove each finding from the code with path:line, the input
or state that triggers it, the wrong outcome and a concrete correction.
Prefer a reproducible command. You may run bounded read-only commands (git,
grep, node -e, `node bin/buildbeat.js --help`); the sandbox blocks writes,
so do not run the test suites. Check every required behaviour in work.md
against the implementation and its tests.

Severity: P0 data loss, security or irreversible harm; P1 functional defect,
a required behaviour from work.md missing or wrong, a documented command
that fails or behaves differently, or required behaviour without a test; P2
maintainability, unclear boundary, or drift that misleads without breaking;
P3 suggestion. Only P0/P1 block. Do not inflate severity.

Return ONLY one JSON object, no prose:
{"status":"succeeded","findings":[{"severity":"P1","summary":"path:line — defect; trigger; impact; correction"}]}
An empty findings list means no actionable defect in your area.
