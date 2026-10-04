Your area: runtime and commands.
Files: src/v2/** and bin/buildbeat.js.

Settle these questions:
- Screenshot requirement: the switch is validated, frozen at creation and
  enforced on resume and approval; the screenshot directory sits outside the
  worktree and is fresh per attempt; only image files become evidence, bound
  to the current candidate with a digest of the stored copy; a successful
  verify without screenshots fails as required; cached verify reuse carries
  the screenshots; the merge check refuses without them; reviewer input,
  status, inbox and notifications list them.
- Release readback: refuses unless a succeeded run's candidate is contained
  in the chosen ref; runs in the main checkout with the worker environment
  allowlist and redaction; records commit, result, exit code, digest and a
  redacted tail in delivery/work/<ID>/releases.jsonl; repeated runs and
  notes behave; closing requires the latest readback to have passed and
  writes a close-work decision that status renders.
- Nothing in these features weakens the existing frozen checks, approval
  binding, ledger compatibility or the legacy 3.x handling.
