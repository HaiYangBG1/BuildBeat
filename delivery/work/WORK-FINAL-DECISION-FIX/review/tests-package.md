Your area: tests and package.
Files: tests/**, tests/support/package-files.txt, the package.json `files`
list and the docs checks in tests/check_docs.py.

Settle these questions:
- Each acceptance item in work.md has a test that drives the actual CLI or
  runtime path through a real ledger and git worktree and would fail without
  the implementation: adopt at the merge decision through verify and review
  back to the merge decision with the final approval bound to the new
  candidate; the stale old-candidate approval; refusals for a non-descendant
  commit, a dirty worktree and an out-of-scope change; fix with a fixer
  (the fixer input carries the reason) and without one (refused with the
  adopt hint); review rounds counted; 3.x run unchanged; status and
  notification commands.
- Tests are deterministic, need no network, clean up after themselves
  (tests/support/tmp.js tempDir()) and do not depend on the host's global
  git configuration or installed runtimes.
- The package contents change only if a shipped file is added, and the
  frozen package list matches; the docs checks still pass for the right
  reason.
