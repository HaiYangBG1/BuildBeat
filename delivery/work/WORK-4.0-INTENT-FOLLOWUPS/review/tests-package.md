Your area: tests and package.
Files: tests/**, tests/support/package-files.txt, the package.json `files`
list and the docs checks in tests/check_docs.py.

Settle these questions:
- Each required behaviour in work.md has a test that fails without the
  implementation (not only an assertion on output text, not a fixture that
  skips the code path).
- Negative paths are covered: missing screenshots, a disabled switch after
  creation, release before merge, a failed readback blocking the close.
- New documents and files that must ship are in the package and the frozen
  package list; nothing private or local is added.
- The docs checks cover the new page and still pass for the right reason.
