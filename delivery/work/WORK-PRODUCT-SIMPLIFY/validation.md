# Validation record

Status: implementation candidate; independent review pending.

Baseline: commit 9fc8454, package 3.3.1, 267 Node tests passed. The candidate
retires observe/release execution tests and replaces generic-rule tests with
fixed-check, migration-refusal and unified-command regressions; core cache,
recovery, isolation, budgeting, findings, notification and evidence tests remain.

Four deterministic scenarios were run against both baseline and candidate:
clean delivery, failed verification followed by repair, resuming an approved
boundary, and invalidating an approval after the candidate moves. All outcomes,
worker invocation counts and human-request counts match. See parity-results.json
and compare-baseline.mjs. Millisecond readings are local scripted-worker timings,
not a model-performance claim.

Installed-package first run: 17 assertions passed, including a failed verifier,
a fixer and independent reviewer. Envelope shell contract: 18 checks passed with
Bash 3.2. Plugin validation and isolated actual installation: 7 checks passed.
Documentation, shell syntax and ShellCheck passed before independent review.

Compatibility: new attempts can use legacy official delivery configurations.
Pre-4.x active runs remain readable/cancellable but must resume/approve with their
original runtime because their ledgers do not prove frozen delivery checks.
No target-project files, installed runtime, remote branch or publication changed.

## First independent review and corrections

The first read-only review inspected candidate 4f24f20 and reported one P1 and
two P2 findings (review-1.json). Fixes select work.md in shipped prompts with an
explicit legacy fallback, expose unaccepted drafts, and scope text decision
cards to the selected Work. First-run tests now omit all legacy artifacts and
validate the worker artifact reference plus prompt guidance. The selected base
must contain the same accepted artifact that workers will read.

An additional CLI regression reproduced a dismissed finding re-blocking final
approval after a no-op fix of the same candidate. It failed before the correction
and passed afterward. Current Work adjudication now applies to all reviews of
that candidate, while a later accept reopens a suppressed issue. Legacy workflow
validation also refuses hidden policies or malformed budgets rather than dropping
them. Final verification and incremental independent review are pending.

## Second independent review

Candidate e7284df passed all 267 Node tests plus documentation, envelope, plugin
and installed-package first run. Independent review confirmed the earlier fixes
and returned one P2: raw Git blobs differ from accepted checkout bytes under
CRLF conversion. Both real-Git autocrlf and .gitattributes cases reproduced the
failure; checkout-filter-aware comparison fixes them without changing acceptance
digests. A real content change still refuses startup.

The next verification run starts at the manual fix handoff from e7284df, adopts
the committed repair, and reruns verification/review. The previous merge request
will be superseded, not approved. No merge decision is being made by the driver.
