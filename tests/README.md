# Repository regression tests

These checks validate BuildBeat itself, never a target project.

## Layers, and what each one does not prove

| Layer | Command | Proves | Does not prove |
|---|---|---|---|
| Runtime unit and protocol | `npm test` → `tests/*.test.js` | Reducer, event ledger, the fixed review workflow and its merge checks, approvals bound to a commit and stale detection, infra classification, findings triage, envelope, release readback, overview stages, tracing code to works; reviews run with workers written in the test (`tests/support/review.js`) | Anything about a real AI tool |
| CLI end to end | `npm test` → `tests/review-commit.test.js`, `run-cli`, `doctor-work` … | The project run config and a work's overrides load, `accept/review/decide/release/status/check/history` behave, env posture reaches the worker, absolute host paths never leak into output, records of this version are readable by the 5.5.0 runtime (skipped in a clone without the tag) | Real worker behaviour |
| **Templates first review** | `npm test` → `tests/templates-firstrun.test.js` | The run config sample in the quickstart parses with the strict YAML subset and uses only current keys; the shipped `templates/` (run config sample, `envelope/worker.sh`, reviewer prompt) carry a commit from `review` to the owner's approval with a **scripted reviewer** | That a real model can do the task; that the packaged artifact carries these files (next row) |
| **Example first review** | `npm test` → `tests/example-firstrun.test.js` | The shipped `example/` snapshot is self-consistent (config parses, run record and decisions are runtime output with no host path), and a verbatim copy reviews a new commit with the project's real `npm test` as verifier | That a real model can do the task |
| **Packaged first review** | `npm run test:pack-firstrun` → `tests/pack-firstrun.test.sh` | `npm pack` → isolated `--prefix` install → the same review driven from the **installed** `bin/` and templates; every current doc is in the package and no historical doc is | Registry availability or provenance (that is `docs/RELEASING.md` readback) |
| Publish helper | `npm test` → `tests/publish-workflow.test.js` | With npm mocked: absent-version publish, exact-integrity resume, conflict rejection, reconciliation | An actual publication |
| Envelope worker | `npm run test:envelope` → `tests/envelope-worker.test.sh` | The shipped `templates/envelope/worker.sh`: tool missing → 75, usage / unknown role → 64, the reviewer captures stdout without overwriting a self-written output, the prompt is the last argument, the example copy is identical; CI runs it on Linux and on macOS with `/bin/bash` (3.2) | That a real AI tool follows the prompt |
| Claude plugin | `npm run test:plugin` → `tests/plugin-marketplace.test.sh` | Manifests validate, links dereference, the plugin excludes `bin/`, the enabled identity is `0.4.0`; live install when a Claude Code CLI is present, reported as skipped otherwise | That installing the plugin installs the runtime (it does not) |
| Documentation | `npm run check:docs` → `tests/check_docs.py` | Relative links, README shape within a band, frontmatter, critical files present and removed scope absent, plugin boundary, package metadata shape, release-runbook consistency, publish-workflow guards, workflow pins, **active-document currency** (no `@next` install lines, parser-aligned worker contract, no auto-load / merge-ready over-claims, no references to the removed generation) | Prose correctness beyond the guarded fragments |
| Package contents | `npm run pack:check` | Which files enter the npm artifact | That they work when installed (packaged first run does) |

Read the **first review** rows together: they are the deterministic half of the acceptance path in `docs/guide/01-quickstart.md`. The other half, a review with a real, versioned AI tool, is never claimed by CI.

## Details

`plugin-marketplace.test.sh` always validates the bounded Claude plugin manifests, canonical repository-relative links, root Skill route, and exclusion of the npm `bin/` directory. When a Claude Code CLI is available, it additionally uses isolated config/cache directories to run strict validation, add the local marketplace, install `buildbeat@buildbeat-plugins`, assert the enabled `0.4.0` identity, and prove that the cached plugin is self-contained with every marketplace link dereferenced. CI without Claude reports the live install portion as skipped instead of pretending that static checks are installation evidence. The plugin version is independent of the npm package version.

`check-docs.sh` uses only Python's standard library. Besides the structural checks listed in the table, it separates **active** documents (README, SKILL, CONTRIBUTING, lessons, `docs/README.md`, matrix, RELEASING, the guides, `templates/`, plugin README, this file) from **historical** ones: only active documents are held to current-distribution claims; release evidence, iteration records, plans, and RFC bodies keep the facts of their own date, with dated revision notes added on top rather than edits underneath.

`publish-workflow.test.js` mocks npm to prove absent-version publication, exact-integrity resume, conflict rejection, commit-unknown reconciliation, and unreconciled failure. `pack:check` audits which files would enter the npm package; `pack-firstrun.test.sh` installs that package and runs it. Neither publishes anything.
