# Implementation plan

1. Remove observe execution, the release lane, UI-specific policies, and default
   governance scaffolding. Keep historical records and document the 3.3.1
   rollback/migration boundary. Preserve project-owned configuration and files.
2. Add one work.md artifact for new work, retaining legacy artifact readback.
   Consolidate execution as run, inspection as status, decisions as decide, and
   diagnostics as check. Existing core command spellings remain compatibility
   aliases over shared handlers. Keep cancellation, history, and safe cleanup.
3. Use a fixed build/verify/review/fix flow and built-in acceptance/evidence
   checks. Standard legacy delivery configurations may be read without changing
   their pinned workflow; unsupported workflows/policies must fail explicitly.
   Old strict requirements cannot silently become weaker.
4. Update the Skill, templates, example, both READMEs, current guides, dated
   RFC revision notes, package manifest and public contract tests.
5. Verify core behavior, package contents/first run, scripts and documentation;
   compare deterministic scenario outcomes and run counts with the baseline.
   Run an independent read-only review against the final candidate and fix
   substantiated findings before presenting the local branch for merge.

The user has authorized these changes in the conversation. This does not
authorize the final merge decision or any remote publication.
