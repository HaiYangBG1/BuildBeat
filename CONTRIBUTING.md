# Contributing to BuildBeat

Contributions should start from a reproducible delivery failure mode: a real incident, a failing test, or a document that says something the code does not do.

## Which document is the authority for what

| Question | Authority | What it is not |
|---|---|---|
| How a session should use BuildBeat, what it says to the user, which command it runs | `SKILL.md` (usage routing and behaviour) plus `templates/` | Not the specification of the state machine |
| What the runtime must do: workflow, policy, approval, events | `docs/v2/RFC-0001/2/3` and `docs/v2/SPEC-0001` (dated revision notes on top; bodies keep their original text) | Not a description of what the code currently does |
| What the code does today | `src/` and `tests/` | Not a licence to redefine the RFCs silently |

When these disagree, the disagreement is the bug: either fix the code and add a test, or revise the RFC/SPEC with a dated note. Never "fix" it by editing only the guide. `docs/v2/guide/` and `README*` are operator views derived from the above.

## Branches and releases

- `main` is protected: pull request only, seven required checks (static/docs, pilot-driver behaviour on two OSes, CLI on three Node/OS combinations, CodeQL), branch must be up to date, rules apply to admins, no force-push, no deletion. Zero required reviewers: a solo maintainer merges their own PR once the checks are green.
- Day-to-day development happens on `v2`; feature branches fork from it and open PRs against `main` (stack them when one depends on another). CI runs on every PR and on pushes to `main` and `v2`.
- Stable releases publish from the tip of `main` to dist-tag `latest`; pre-releases publish from the dispatching release branch to dist-tag `next` and never move `latest`. The exact mechanics, invariants, and the post-release synchronization checklist are in [`docs/RELEASING.md`](docs/RELEASING.md).

## Local setup

Use Node.js 20 or newer, Git, and Bash:

```bash
npm ci --ignore-scripts
npm test                      # Node unit + CLI end-to-end (runtime, templates first run, publish helper mocks)
npm run test:pilot            # M-1 pilot driver preflight guards (historical driver, kept green)
npm run test:plugin           # Claude Code plugin manifests and isolated install
npm run test:pack-firstrun    # pack → isolated install → drive a run from the installed templates
npm run check:docs            # links, README shape, contracts, package metadata, active-doc currency
npm run pack:check
git diff --check
```

Shell changes should also pass `bash -n` and ShellCheck. Workflow changes should pass `actionlint` when it is available. [`tests/README.md`](tests/README.md) explains what each layer proves and, just as important, what it does not prove (a scripted worker is not a real model).

## Pull requests

- Keep one reviewable failure mode per pull request.
- Update `CHANGELOG.md` (under `## Unreleased`) for every user-visible, workflow, release, or governance change.
- When workflow semantics change, update `SKILL.md`, the affected templates, both READMEs, and tests together. When a documented sample changes, make sure a test still parses or runs it (`tests/v2-templates-firstrun.test.js` covers the run-config samples).
- Add regression evidence and call out compatibility, migration, security, and rollback boundaries.
- `lessons.md` and `evals/` take real incidents only: an eval is added red first, then made green by the fix. Do not add lessons for hypothetical failures.
- Never include credentials, private project source, personal data, company or internal-system names, or local paths.

Opening a pull request does not authorize merge, npm publication, deployment, or writes to a target project. Releases use the protected tag and Trusted Publishing process in [`docs/RELEASING.md`](docs/RELEASING.md).

Report vulnerabilities through [`SECURITY.md`](SECURITY.md), not a public issue.
