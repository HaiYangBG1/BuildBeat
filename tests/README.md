# Repository regression tests

These checks validate Solobaton itself. They are separate from `templates/scripts/verify-status.sh`, which is copied into a target project and runs that project's own test suites.

## Commands

```bash
bash tests/test-scripts.sh
bash tests/check-docs.sh
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

`check-docs.sh` uses only Python's standard library. It validates relative Markdown links, rejects non-portable internal citation markers, checks the bilingual README structure and required frontmatter, and confirms that critical scaffold files exist.
