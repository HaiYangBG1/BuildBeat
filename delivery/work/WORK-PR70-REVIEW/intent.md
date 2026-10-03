# Independent review of PR #70 (product simplification)

PR #70 (`feat/product-simplification`, head `6554f2d`) is the breaking
4.0.0-dev.0 candidate: 130 files, about 3.9k additions and 5.2k deletions. It
already went through three read-only review rounds and one code review. The
owner wants a separate, thorough review before deciding the merge, covering
both the code and the intent of the change.

Goal: find every substantiated correctness, compatibility, data-loss, security
and documentation defect in the full PR delta against main (`9fc8454`, the
3.3.1 release), with evidence, and close the blocking ones. Separately, judge
the change intent: whether the stated problem is real and evidenced, whether
each retirement and consolidation serves the product's core promises, whether
the implementation matches what was intended and authorised, and whether the
evidence supports the conclusions the PR draws.

Scope: the whole delta `9fc8454..6554f2d` — runtime, CLI, compatibility with
3.3.1 configurations and ledgers, migration promises, templates, example,
Skill, plugin, bilingual guides, tests and package contents — plus the intent
as stated in the PR description, WORK-PRODUCT-SIMPLIFY, CHANGELOG and
docs/MIGRATION.md, weighed against the history of the retired features
(CHANGELOG, lessons, docs/history). The whole-file reformatting is
acknowledged and is not reported on its own.

Out of scope: merging, pushing, publishing and changing installed runtimes.
The review may recommend reconsidering a product decision, but changing the
product scope stays the owner's decision; intent findings are reported to the
owner, not implemented automatically.

Acceptance: the full local verification passes on the final candidate (Node
regressions, docs, envelope, plugin, packaged first run, and the deterministic
3.3.1 parity scenarios); the multi-area read-only review of that candidate
returns no unadjudicated P0/P1 in the code areas; every intent finding is
decided by the owner; P2/P3 findings are listed for the owner.

Stop line: four review rounds for this Work. Fix commits stay local until the
owner decides whether they go to PR #70.
