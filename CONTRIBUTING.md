# Contributing to BuildBeat

Contributions should start from a reproducible delivery failure mode. BuildBeat keeps workflow semantics in `SKILL.md`; templates, examples, bilingual READMEs, tests, and the changelog must remain aligned with that source of truth.

## Local setup

Use Node.js 20 or newer, Git, and Bash:

```bash
npm ci --ignore-scripts
npm test
npm run test:scripts
npm run test:skill-only
npm run check:docs
npm run pack:check
git diff --check
```

Shell changes should also pass `bash -n` and ShellCheck. Workflow changes should pass `actionlint` when it is available.

## Pull requests

- Keep one reviewable failure mode per pull request.
- Update `CHANGELOG.md` for every user-visible, workflow, release, or governance change.
- Update `SKILL.md`, affected templates, both READMEs, examples, and tests together when workflow semantics change.
- Add regression evidence and call out compatibility, migration, security, and rollback boundaries.
- Never include credentials, private project source, or personal data.

Opening a pull request does not authorize merge, npm publication, deployment, or writes to a target project. Releases use the protected tag and Trusted Publishing process in [`docs/RELEASING.md`](docs/RELEASING.md).

Report vulnerabilities through [`SECURITY.md`](SECURITY.md), not a public issue.
