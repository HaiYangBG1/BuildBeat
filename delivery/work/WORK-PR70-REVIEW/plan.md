# Review plan

1. Base the run on PR head `6554f2d` plus this Work's files. The installed
   3.3.1 runtime drives the run, so the review does not depend on the 4.0
   runtime it reviews. Builder and fixer are not configured: the driving
   session adopts the candidate and writes any fix itself.
2. Verify (`verify.sh`): npm test, check:docs, test:envelope, test:plugin,
   test:pack-firstrun, git diff --check, and the deterministic 3.3.1 parity
   scenarios from WORK-PRODUCT-SIMPLIFY against a `git archive` of `9fc8454`.
3. Review (`review.sh`): four read-only codex passes run in parallel, one per
   area, merged into one envelope:
   - runtime: engine, policy, orchestrator, decisions, overview, notify,
     findings, run records; frozen safeguards and approval/resume/adopt
     binding.
   - cli-compat: run/status/decide/check/history and the legacy aliases;
     3.3.1 configurations, workflows, presets and ledgers against
     docs/MIGRATION.md.
   - docs-surface: README zh/en, SKILL.md, guides zh/en, MIGRATION,
     CAPABILITY-MATRIX, RFC notes, templates, example, plugin, CHANGELOG;
     every documented command and claim checked against the code.
   - tests-package: removed versus retained coverage, new behaviour without
     tests, package whitelist and frozen file list, first-run paths, and the
     evidence recorded by WORK-PRODUCT-SIMPLIFY.
   A missing tool, failed pass or unparseable answer is an infrastructure
   stop, never a clean review. Later rounds review only the new delta and
   re-check prior findings in their area.
4. Blocking findings: the driving session fixes substantiated ones with a
   regression test and adopts the commit; findings it disputes go to the
   owner to accept or dismiss. P2/P3 findings are reported, not auto-fixed.
5. Stop at the merge decision with the findings and evidence. Pushing any fix
   commit to PR #70 is a separate owner decision.
