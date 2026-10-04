# Worker contract

[简体中文](05-worker-contract.md)

Builders and fixers commit changes inside the allowed scope. Verifiers run real acceptance commands. Reviewers independently inspect the pinned candidate without changing the worktree.

Structured output: {"status":"succeeded","findings":[{"severity":"P2","summary":"specific issue"}]}. severity is P0–P3 and summary is a string; P0/P1 routes to repair. A changed worktree after a read-only step blocks its result.

Review input includes adjudication anchors and an available lastReviewed incremental range. Fix input includes current findings and adjudications. Prompts may use these facts but cannot approve decisions.

Use exit 75 for missing tools, unavailable backends or an unusable execution environment. Do not change business code to hide an environment failure. Do not print credentials. The runner reads candidate, exit status and evidence itself.

`BUILDBEAT_INPUT.workArtifact` carries the selected repository-relative `ref` and accepted `digest`. Read that artifact; use work.md first and legacy intent/plan only when work.md is absent.
