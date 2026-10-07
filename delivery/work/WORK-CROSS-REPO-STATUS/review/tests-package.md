Your area: tests and package.
Files: tests/**, tests/support/package-files.txt, the package.json `files`
list and the docs checks in tests/check_docs.py.

Settle these questions:
- Each acceptance item 1-7 in work.md has a test that builds real git
  repositories in temporary directories (tests/support/tmp.js tempDir()),
  drives the actual CLI or runtime path, and would fail without the
  implementation (not only an assertion on unrelated output, not a fixture
  that skips the code path).
- The read-only guarantee is tested by comparing every repository's files
  before and after, including runtime directories.
- Tests are deterministic, need no network, clean up after themselves and
  do not depend on the host's global git configuration or installed
  runtimes.
- The package contents change only if a shipped file is added, and the
  frozen package list matches; the docs checks still pass for the right
  reason.
