You are one of five independent read-only reviewers of GitHub PR #70 in this
repository (BuildBeat): "refactor!: focus on recoverable delivery, reduce the
product scope and the command surface", the breaking 4.0.0-dev.0 candidate.
Each reviewer owns one area (below): four review the code, one reviews the
change intent. Stay in your area, but follow any call path out of it that you
need to prove a finding.

Read first:
- delivery/work/WORK-PR70-REVIEW/intent.md and plan.md (this review's scope);
- delivery/work/WORK-PRODUCT-SIMPLIFY/intent.md and plan.md (what the PR was
  authorised to do) and docs/MIGRATION.md (its compatibility promises);
- CHANGELOG.md, section v4.0.0-dev.0.

The delta under review is `git diff 9fc8454..HEAD`, excluding
delivery/work/WORK-PR70-REVIEW/ (this review's own files). 9fc8454 is the
3.3.1 release on main; its code is the behaviour baseline (`git show
9fc8454:<path>`). If BUILDBEAT_INPUT below has lastReviewed.range, review only
that range's delta and re-check the prior findings of your area; otherwise
review the full delta of your area.

Already settled, do not report:
- For the code areas, retirements documented in docs/MIGRATION.md (observe,
  the release lane, UI gates, workflow/policy authoring, governance
  scaffolding, the Skill-only route) are intentional. Report only a broken
  promise around them, such as a documented error path that does not happen
  or records that no longer read. The change-intent area judges those
  decisions themselves.
- The whole-file reformatting is acknowledged; report formatting only where
  it changed behaviour.
- Findings adjudicated in BUILDBEAT_INPUT.anchor keep their verdict; do not
  restate them in other words.
- Commit 6554f2d fixed: run-family prefix matching, the legacy default when
  riskPreset is omitted, legacy planner entry with acceptance, terminal legacy
  runs, status hints, duplicate reads and the findings reader. Report a defect
  in those fixes if you find one.

How to review:
- Prove each finding from the code: name path:line, the input or state that
  triggers it, the wrong outcome, and a concrete correction. Prefer a
  reproducible command. You may run bounded read-only commands (git, grep,
  node -e, `node bin/buildbeat.js --help`). The sandbox blocks writes, so do
  not run the test suites; verification evidence already exists for this
  candidate.
- For every removed or rewritten line in your area, name the invariant it
  enforced in 3.3.1 and where the new code keeps it, or report the gap.
- Do not modify files, create approvals or run commands that write.

Severity: P0 data loss, security or irreversible harm; P1 functional defect,
a broken compatibility or migration promise, a documented command that fails
or behaves differently than documented, or plan-required behaviour without a
test; P2 maintainability, unclear boundary, or drift that misleads without
breaking; P3 suggestion. Only P0/P1 block. Do not inflate severity.

Return ONLY one JSON object, no prose:
{"status":"succeeded","findings":[{"severity":"P1","summary":"path:line — defect; trigger; impact; correction"}]}
An empty findings list means no actionable defect in your area.
