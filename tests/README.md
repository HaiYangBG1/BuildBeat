# Repository regression tests

These checks validate BuildBeat itself. They are separate from `templates/scripts/verify-status.sh`, which is copied into a target project and runs that project's own test suites.

## Commands

```bash
npm test
npm run test:scripts
npm run test:skill-only
npm run test:plugin
npm run check:docs
npm run pack:check
```

`test-scripts.sh` creates disposable Git repositories under a `mktemp` directory and exercises both supported layouts. Its first scenarios are loaded from `tests/fixtures/<name>/project/`. A fixture may extend `healthy-default` and overlay only the fact it changes. Every fixture has an `expected-findings.json` with this executable schema 1 contract:

- `schemaVersion`: fixture schema, currently exactly `1`;
- `expectedCodes`: ordered unique `docs/CHECKS.md` codes emitted by `bus-check --format=json --strict`;
- `expectedCoverageComplete`: the expected coverage boundary;
- `json.strictExit`: the expected structured strict result;
- `legacy.strictExit`, `contains`, and `notContains`: retained operator-facing human-output assertions;
- optional `env.BUS_REF_MAX`: a fixture-only bounded-scan override.

The runner validates JSON syntax, registered code/level pairs, stable unique code order, exact summary counts, relative safe paths, coverage reasons, and strict blocking. The fixture set covers healthy legacy boards, broken NOW pointers, completed work without evidence, Gate reason/traceability/protocol failures, valid completed evidence, ghost hashes, stale live boards, truncated reference scans, legal partial presence plus valid/Draft/invalid optional standards, matching/conflicting/unverified STACK baselines, legal/illegal ADR Status, and broken ADR supersession. The remaining dynamic scenarios cover:

- clean and bloated coordination state;
- the teaching example's 11 intentional ghost hashes while its optional standards/ADR remain structurally clean and its omitted code repositories keep STACK observation explicitly unverified;
- ghost hashes, including URL false positives and mixed URL/hash segments;
- automatic discovery of a sub-repository whose name contains spaces;
- per-domain status write boundaries and the iteration-ritual exception;
- bulk staging and its explicit override;
- provider-side contract reminders without client-consumer noise;
- blocking behavior when the configured gitleaks scan reports a finding;
- honest unconfigured and stale L3 machine status;
- missing rendered-design failure and an HTML entry whose filename contains spaces;
- drift-baseline protection and changed-key reporting when `jq` is available.

`skill-only.test.sh` copies the canonical base templates into a disposable project, excludes optional `standards/` and `pm/adr/`, fills the deterministic bootstrap choices, shadows `node` with a failing stub, and proves strict `bus-check` succeeds without a CLI manifest. This keeps the Skill/manual installation path first-class alongside the unpublished Wave 1 CLI source candidate.

`plugin-marketplace.test.sh` always validates the bounded Claude plugin manifests, canonical repository-relative links, root Skill route, and exclusion of the npm `bin/` directory. When a Claude Code CLI is available, it additionally uses isolated config/cache directories to run strict validation, add the local marketplace, install `buildbeat@buildbeat-plugins`, assert the enabled `0.1.0` identity, and prove that the cached plugin is self-contained with every marketplace link dereferenced. CI without Claude reports the live install portion as skipped instead of pretending that static checks are installation evidence.

`check-docs.sh` uses only Python's standard library. It validates relative Markdown links, rejects non-portable internal citation markers, checks the bilingual README structure and required frontmatter, confirms that critical scaffold/CLI/governance files exist, keeps package/changelog/example versions aligned, rejects hard-coded semver executable commands in distribution-facing docs, verifies the repository's Dependabot/CodeQL security baseline, and requires immutable full-SHA references for every external GitHub Action.

`cli.test.js` uses Node's built-in test runner and disposable directories. It verifies the published-v0/source-candidate boundary, default/compact planning and writes, explicit confirmation, optional-prefix exclusion, package/index/browser-extension-manifest project signals, destination and symlink refusal, clean-root-Git enforcement, exact `.gitignore` fragment ownership, schema 1 compatibility, schema 2 validation, executable preservation, in-process rollback, stable JSON/error codes, and the executable entry point. Every automated write test targets a disposable sandbox; the separately authorized local-directory pilot is documented in `docs/PHASE2-PILOT-2026-08-25.md`. `publish-workflow.test.js` mocks npm to prove absent-version publication, exact-integrity resume, conflict rejection, commit-unknown reconciliation, and unreconciled failure. `pack:check` audits which files would enter the npm package; it does not publish anything.
