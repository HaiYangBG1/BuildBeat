Your area: the change intent. Judge whether this change should be made the
way it is, not only whether the code is right. The "already settled" note on
retirements does not bind this area: here you judge those decisions.

Sources: delivery/work/WORK-PR70-REVIEW/pr-description.md (snapshot of the
PR text), delivery/work/WORK-PRODUCT-SIMPLIFY/ (intent, plan, validation,
verification-summary.json, parity-results.json, compare-baseline.mjs),
CHANGELOG.md (v4.0.0-dev.0 and the entries that introduced each retired
feature), docs/MIGRATION.md, lessons.md, docs/history/** (iteration records,
pilot reports, decisions), README zh/en and docs/CAPABILITY-MATRIX.md before
and after (`git show 9fc8454:<path>`).

Settle these questions:
- Problem statement: is the stated problem (scope sprawl, scattered
  artifacts and commands, maintenance cost) evidenced, and do the chosen cuts
  address it? Name each claim in the PR text or WORK-PRODUCT-SIMPLIFY that
  the recorded evidence does not support, and say what evidence would.
- Each retirement and consolidation (observe, release-readback lane and
  release preset, UI gates, workflow/policy authoring, risk preset DSL,
  governance scaffolding, the Skill-only route, intent/plan merged into
  work.md, the command consolidation): trace why it was added (CHANGELOG,
  lessons, docs/history incidents), who loses what, whether the original
  incident would recur, and whether docs/MIGRATION.md gives those users a
  workable path.
- Core promises (switch sessions and continue; AI pushes the work forward;
  evidence-backed human decisions): does any cut or consolidation weaken
  one of them? Is anything kept that the stated principle says should go,
  or removed that it says should stay?
- Intent versus implementation: what the intent or plan promised that the
  change does not do, and what the change does that was not authorised
  (scope creep, version and plugin bumps, package or default changes).
- Risk and reversibility: blast radius of the breaking change for existing
  users and their active runs, the rollback story, and whether a staged
  deprecation or a narrower first step would have served the stated goal.
  State what must be true before merge and before publish.
- Evidence quality: do the parity scenarios, package size figures and review
  rounds support the conclusions drawn in the PR description?

Severity in this area: P1 when the change contradicts its stated intent, a
premise the decision rests on is false or unsupported in a way that could
change the owner's decision, or a cut breaks a core promise without a
migration path; P2 for a weakly evidenced claim, missing rationale or a
scope question that deserves an explicit owner decision; P3 suggestion.
The owner decides these findings: phrase each summary as the decision to
make, with the evidence (path:line or record) that raises it.
