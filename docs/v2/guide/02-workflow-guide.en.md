# Fixed delivery flow and configuration

[简体中文](02-workflow-guide.md)

The built-in graph is build → verify → review → wait-merge; a failed verifier or P0/P1 review routes through fix → verify. New configurations omit workflow, riskPreset and policies. Arbitrary workflows and rule languages are retired.

- Configure builder/verifier/reviewer/fixer commands in workers and allowed changes in allowedPaths. A missing worker produces an attended handoff.
- reviewTriage defaults to off; required retains explicit adjudication before fixing.
- budgets.reviewRoundsPerWork defaults to 6 across all runs of a Work. Per-step maxAttempts remain available. Successful writing steps and infrastructure failures do not spend the failure budget; a total-attempt safeguard remains.
- Repeated issues, including restated findings, or an increasing blocker count stop the loop. Adjudication still uses exact fingerprints.
- stopAt inserts a human boundary at a fixed step. maxReviewSeverity: P3 raises the final review requirement; the default is P2.
- parallel: true allows different Works to run together; runs of one Work stay exclusive. Tests must not share fixed ports or external mutable state.
- Verification caching matches tree, worker command and envelope digest. Failed results and dirty trees are never reused. Keep caching off for checks dependent on external changes.
- requires checks command versions and probes; envelope supplies role prompts, variables and Git pins; redact scrubs final evidence logs, not live output.
- Configuration is validated as a whole before execution. YAML is a strict subset; use block lists/maps as in the template.

Official legacy delivery files retain their digest and safeguards. Custom/release workflows are rejected explicitly, never silently downgraded. See [migration](../../MIGRATION.md). Exclude .buildbeat/** from test discovery.
