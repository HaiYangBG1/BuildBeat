# Repository regression tests

These checks validate Solobaton itself. They are separate from `templates/scripts/verify-status.sh`, which is copied into a target project and runs that project's own test suites.

## Commands

```bash
bash tests/test-scripts.sh
bash tests/check-docs.sh
npm test
npm run pack:check
```

`test-scripts.sh` creates disposable Git repositories under a `mktemp` directory and exercises both supported layouts. Its scenarios cover:

- clean and bloated coordination state;
- ghost hashes, including URL false positives and mixed URL/hash segments;
- automatic discovery of a sub-repository whose name contains spaces;
- per-domain status write boundaries and the iteration-ritual exception;
- bulk staging and its explicit override;
- provider-side contract reminders without client-consumer noise;
- blocking behavior when the configured gitleaks scan reports a finding;
- honest unconfigured test status;
- missing rendered-design failure and an HTML entry whose filename contains spaces;
- drift-baseline protection and changed-key reporting when `jq` is available.

`check-docs.sh` uses only Python's standard library. It validates relative Markdown links, rejects non-portable internal citation markers, checks the bilingual README structure and required frontmatter, confirms that critical scaffold/CLI files exist, keeps package/changelog/example versions aligned, and rejects hard-coded semver executable commands in distribution-facing docs so an immutable npm README cannot remain pinned to the preceding release.

`cli.test.js` uses Node's built-in test runner and disposable directories. It verifies the v0 read-only boundary, default/compact planning, project-signal detection, zero-write behavior, layout conflict handling, manifest fail-closed behavior, stable JSON/error codes, and the executable entry point. `publish-workflow.test.js` mocks npm to prove absent-version publication, exact-integrity resume, conflict rejection, commit-unknown reconciliation, and unreconciled failure. `pack:check` audits which files would enter the npm package; it does not publish anything.
