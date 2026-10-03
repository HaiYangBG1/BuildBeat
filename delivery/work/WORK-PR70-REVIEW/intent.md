# Independent review of PR #70 (product simplification)

PR #70 (`feat/product-simplification`, head `6554f2d`) is the breaking
4.0.0-dev.0 candidate: 130 files, about 3.9k additions and 5.2k deletions. It
already went through three read-only review rounds and one code review. The
owner wants a separate, thorough review before deciding the merge.

Goal: find every substantiated correctness, compatibility, data-loss, security
and documentation defect in the full PR delta against main (`9fc8454`, the
3.3.1 release), with evidence, and close the blocking ones.

Scope: the whole delta `9fc8454..6554f2d` — runtime, CLI, compatibility with
3.3.1 configurations and ledgers, migration promises, templates, example,
Skill, plugin, bilingual guides, tests and package contents. Retirements listed
in docs/MIGRATION.md are intentional and not defects in themselves; the
whole-file reformatting is acknowledged and is not reported on its own.

Out of scope: merging, pushing, publishing, changing installed runtimes, and
re-deciding the product scope of the simplification.

Acceptance: the full local verification passes on the final candidate (Node
regressions, docs, envelope, plugin, packaged first run, and the deterministic
3.3.1 parity scenarios); the multi-area read-only review of that candidate
returns no unadjudicated P0/P1; P2/P3 findings are listed for the owner.

Stop line: four review rounds for this Work. Fix commits stay local until the
owner decides whether they go to PR #70.
