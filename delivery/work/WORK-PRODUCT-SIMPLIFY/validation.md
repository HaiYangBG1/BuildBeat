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
