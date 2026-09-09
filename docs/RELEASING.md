# BuildBeat CLI package release runbook

This runbook governs BuildBeat's public npm distribution. The canonical package is `@haiyangbg/buildbeat` in `HaiYangBG1/BuildBeat`; the only executable is `buildbeat`. No other package name or executable alias receives publications.

Release evidence at source package version `@haiyangbg/buildbeat@3.0.1`; latest independently verified BuildBeat npm distribution `@haiyangbg/buildbeat@3.0.1` (dist-tag `latest`; `next` stays `3.0.0`), anchored by annotated tag `v3.0.1` at commit `c322ce9`, workflow run [34370800960](https://github.com/HaiYangBG1/BuildBeat/actions/runs/34370800960), and archived in [`V3.0.1-RELEASE-EVIDENCE-2026-09-09.md`](V3.0.1-RELEASE-EVIDENCE-2026-09-09.md). The 3.0.0 chain (`latest` from 2026-09-09 until 3.0.1 took over the same day; the first version without the removed generation) stays archived in [`V3.0.0-RELEASE-EVIDENCE-2026-09-09.md`](V3.0.0-RELEASE-EVIDENCE-2026-09-09.md). The 2.0.2 chain (`latest` from 2026-09-09 until 3.0.0 took over the same day; the last version carrying the removed generation) stays archived in [`V2.0.2-RELEASE-EVIDENCE-2026-09-09.md`](V2.0.2-RELEASE-EVIDENCE-2026-09-09.md). The 2.0.1 chain (`latest` from 2026-09-06 until 2.0.2 took over on 2026-09-09) stays archived in [`V2.0.1-RELEASE-EVIDENCE-2026-09-06.md`](V2.0.1-RELEASE-EVIDENCE-2026-09-06.md). The 2.0.0 chain (`latest` from 2026-09-05 until 2.0.1 took over on 2026-09-06) stays archived in [`V2.0.0-RELEASE-EVIDENCE-2026-09-05.md`](V2.0.0-RELEASE-EVIDENCE-2026-09-05.md). The beta.5 chain stays archived in [`V2.0.0-BETA.5-RELEASE-EVIDENCE-2026-09-05.md`](V2.0.0-BETA.5-RELEASE-EVIDENCE-2026-09-05.md). The beta.4 chain stays archived in [`V2.0.0-BETA.4-RELEASE-EVIDENCE-2026-09-03.md`](V2.0.0-BETA.4-RELEASE-EVIDENCE-2026-09-03.md); the beta.3 chain in [`V2.0.0-BETA.3-RELEASE-EVIDENCE-2026-09-01.md`](V2.0.0-BETA.3-RELEASE-EVIDENCE-2026-09-01.md). The beta.2 chain stays archived in [`V2.0.0-BETA.2-RELEASE-EVIDENCE-2026-08-28.md`](V2.0.0-BETA.2-RELEASE-EVIDENCE-2026-08-28.md); the beta.1 chain stays archived in [`V2.0.0-BETA.1-RELEASE-EVIDENCE-2026-08-28.md`](V2.0.0-BETA.1-RELEASE-EVIDENCE-2026-08-28.md). Earlier distributions and the retired legacy package name are archived in the dated evidence files under `docs/`.

## Channels and branches

| Channel | Source | dist-tag | How |
|---|---|---|---|
| Stable | tip of `main` (a release branch → pull request → merge commit → annotated tag `vX.Y.Z` on that commit) | `latest` | `workflow_dispatch` of `publish.yml` with the exact tag; the workflow refuses a tag that is not on `main` for the stable channel |
| Pre-release | the dispatching release branch (normally `v2`), version `X.Y.Z-beta.N` | `next` | same dispatch; `latest` never moves for a pre-release |

`main` is protected (pull request only, seven required checks, admins included, no force-push); day-to-day work lands on `v2` and reaches `main` through PRs. Since 2.0.0 `latest` is the v2 line; `next` is only for later pre-releases.

## Release invariants

1. One npm version maps to one immutable annotated Git tag and one exact source commit. Never move a published version's tag.
2. The runtime version comes from `package.json` (`buildbeat --version`). Project templates under `templates/v2/` are copied into projects by hand; a package release never rewrites a project's files.
3. Publish only from a clean worktree whose `HEAD`, tag target, tested commit, and packed artifact all match.
4. `publishConfig.registry` stays pinned to `https://registry.npmjs.org/`; a developer's mirror configuration must not redirect a public release.
5. A successful `npm publish` response is not enough. Registry metadata, tarball contents, an isolated install, the executable version, and a read-only command must be checked independently.
6. `npm install/update/uninstall` manage the CLI package only. They must never be described as project-scaffold `init/upgrade/uninstall` support.
7. After a version is published, later `main` documentation changes carrying that same `package.json` version do not redefine its artifact and are not releasable candidates. The next publication requires a new package version, Changelog heading, and annotated tag.
8. Canonical examples use `@haiyangbg/buildbeat@latest`, not a hard-coded release number. Reproducible consumers first resolve `npm view @haiyangbg/buildbeat@latest version`, record that exact version, and substitute it for `@latest`; exact release evidence remains in this runbook and the matching GitHub Release. One-off commands use `npx --yes --package=@haiyangbg/buildbeat@latest buildbeat ...`.
9. The active repository ruleset `Protect release tags` must match `refs/tags/v*`, forbid tag updates and deletions, and grant no bypass actor. It deliberately does not forbid creation, so a reviewed new release tag can still be created once.
10. The README install line `npm install --global @haiyangbg/buildbeat@latest` is safe to advertise because every artifact that has held `latest` passed registry/provenance/signature/isolated-install/README readback before the tag moved.

## Candidate checks

Run from the exact release candidate:

```bash
npm ci --ignore-scripts --no-audit --no-fund
bash -n .github/scripts/*.sh templates/scripts/*.sh tests/*.sh
shellcheck -x .github/scripts/*.sh templates/scripts/*.sh tests/*.sh
actionlint .github/workflows/*.yml
bash tests/check-docs.sh
bash tests/test-scripts.sh
npm run test:plugin
npm test
npm publish --dry-run --access public --registry=https://registry.npmjs.org/
gitleaks git --no-banner --redact --no-color
git diff --check
```

Before pushing a tag, confirm that the package name/version is absent from the official registry and that the candidate commit's `main` CI is green. An `E404` only proves point-in-time absence; it does not reserve the name.

Also read back the server-side tag rule instead of assuming that repository documentation represents current GitHub configuration:

```bash
tag_ruleset_id="$(gh api repos/HaiYangBG1/BuildBeat/rulesets \
  --jq '.[] | select(.name == "Protect release tags" and .target == "tag") | .id')"
test -n "$tag_ruleset_id"
gh api "repos/HaiYangBG1/BuildBeat/rulesets/$tag_ruleset_id" \
  --jq '{enforcement, include: .conditions.ref_name.include, rules: [.rules[].type], bypass_actors}'
```

The expected readback is active enforcement, include pattern `refs/tags/v*`, exactly the `update` and `deletion` rules, and an empty bypass list. Stop the release if that mutable server-side state differs.

## Initial public package bootstrap

The scoped package must exist before npm can bind a Trusted Publisher. Use the official web login rather than copying a token into the repository. Bootstrap the namespace with a deliberately minimal `0.0.0` package under the non-default `bootstrap` dist-tag; do not publish the reviewed 1.20 artifact manually, because a manual first release cannot later gain OIDC provenance retroactively:

```bash
npm login --auth-type=web --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm publish --access public --tag bootstrap --registry=https://registry.npmjs.org/
npm view @haiyangbg/buildbeat dist-tags --json --registry=https://registry.npmjs.org/
```

The intended bootstrap readback is `bootstrap: 0.0.0` without a stable `latest` claim. During the first BuildBeat package creation, npm also attached `latest: 0.0.0` despite the explicit non-default tag and rejected the authenticated delete with HTTP 400. Treat any such first-package `latest` as temporary bootstrap exposure: do not activate launch documentation, do not republish or unpublish the immutable version, and complete the reviewed OIDC release so the real version takes over `latest`. The readback at the time of that first scoped release (2026-08-25) was `bootstrap: 0.0.0` and `latest: 1.21.0`; since 2026-09-05 `latest` is `2.0.0` and `next` is `2.0.0-beta.5` (see the current-state paragraph at the top of this runbook). The bootstrap package page is registry-creation evidence only: it is not a BuildBeat release, is not tagged in Git, and has no provenance claim. The npm documentation requires 2FA or an allowed granular token for direct publication; no long-lived publish token belongs in Git, shell history, logs, or a chat transcript. See npm's guides for [scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/) and [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/).

## Independent readback

After publication, query the public registry explicitly and install into a new temporary prefix:

```bash
release_version="$(node -p "require('./package.json').version")"

npm view "@haiyangbg/buildbeat@$release_version" name version dist-tags.latest \
  --registry=https://registry.npmjs.org/

release_probe="$(mktemp -d)"
npm install --prefix "$release_probe" "@haiyangbg/buildbeat@$release_version" \
  --registry=https://registry.npmjs.org/ --ignore-scripts --no-audit --no-fund
node "$release_probe/node_modules/@haiyangbg/buildbeat/bin/buildbeat.js" --version
node "$release_probe/node_modules/@haiyangbg/buildbeat/bin/buildbeat.js" >/dev/null
```

The expected version is exact. The bare invocation prints usage and exits 0 without touching the current directory; the acceptance condition is zero project writes, not a forced green diagnosis.

Only after this readback should the matching GitHub Release be published and documentation treat the npm version as independently verified.

## Trusted Publishing releases

For Trusted Publishing, the public npm package must be bound to this repository and `.github/workflows/publish.yml`. The workflow is deliberately manual: a human supplies one exact annotated tag only after the release commit is the current `main` HEAD and its CI is green. The OIDC-bearing `publish` job uses a GitHub-hosted runner, Node 24, pinned npm 11.19.0, immutable full-SHA action references, `contents: read`, job-scoped `id-token: write`, and the protected `npm-publish` GitHub Environment. That Environment must be restricted to protected branches and require an authorized release reviewer; its branch policy and explicit approval form the server-side dispatch boundary.

Before publishing, the job rejects a non-semantic or lightweight tag, any dispatch outside `main`, a tag/checkout/event/remote-HEAD mismatch, a package-version mismatch, or failed release checks. It then packs one exact tarball. If the registry version already exists, publication may continue only when `dist.integrity` exactly matches that candidate. If `npm publish` returns an ambiguous failure, bounded registry reconciliation accepts only the same integrity. A different artifact fails closed.

Registry, provenance, install, and signature readback run in a separate `verify` job without `id-token: write`. This lets an operator rerun failed verification without attempting to republish an immutable npm version; successful publication still does not count as a verified release until that job and the independent readback below both pass.

Bind the npm package to the exact workflow after that workflow exists on the default branch:

```bash
npx --yes npm@11.19.0 trust github @haiyangbg/buildbeat \
  --file publish.yml \
  --repo HaiYangBG1/BuildBeat \
  --env npm-publish \
  --allow-publish \
  --registry=https://registry.npmjs.org/
```

For a new version, push the reviewed annotated tag, wait for its `main` CI, then trigger the workflow and verify it before creating the GitHub Release:

```bash
gh workflow run publish.yml --ref main -f tag=vX.Y.Z
gh run watch --exit-status
```

npm now processes a publish asynchronously (`npm publish` prints "being processed and may take a few minutes"); the verify job waits up to ten minutes for the exact version, the dist-tag and the provenance to read back. If it still fails **only** on readback, wait for `npm view` to show the version and re-run the failed job (`gh run rerun <run-id> --failed`); never publish again. Real incident: 3.0.0 became readable about six minutes after `npm publish` returned.

The workflow waits for exact registry-version readback, requires `dist.attestations` to expose an npm attestation URL with the SLSA v1 provenance predicate, installs the public package into a clean temporary prefix, checks its executable version, and runs `npm audit signatures`. The release operator must still repeat the isolated-install and read-only `doctor` check independently before publishing the matching GitHub Release. Never use `workflow_dispatch` to bypass the repository's human merge or tag Gate.

Trusted Publishing removes the long-lived write token and automatically emits provenance for supported public GitHub repositories. Configure the exact owner, repository, workflow filename, allowed `npm publish` action, and the exact `npm-publish` environment on npmjs.com. A GitHub Environment without the matching npm-side environment binding is not sufficient evidence. See npm's [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) and [provenance](https://docs.npmjs.com/generating-provenance-statements/) documentation.

The bootstrap `0.0.0` package is not retroactively provenance-backed and must remain on the non-default `bootstrap` tag. The existence of the workflow and trusted-publisher binding is configuration evidence only; npm validates the binding during the real publish. After the first OIDC release succeeds, set `npm access set mfa=publish @haiyangbg/buildbeat` and independently read back npm's most restrictive Publishing access option, currently labeled `Require two-factor authentication and disallow bypass 2fa tokens (recommended)`, while preserving the Trusted Publisher. Because package access, trust, tags, and deprecation are mutable registry state, future release operators must recheck them live.

## Post-release synchronization checklist

Publishing the artifact is one surface. These are the others; each has drifted at least once, so tick them in the same sitting as the release (the docs check catches most of them, the two GitHub-side items it cannot):

- [ ] `CHANGELOG.md`: `## Unreleased` renamed to the version with date and the publication paragraph (run id, dist-tag, readback).
- [ ] `docs/<VERSION>-RELEASE-EVIDENCE-<date>.md` archived; the current-state paragraph at the top of this runbook names the new version and the previous stable moves to a dated past tense — never two "current" versions in one runbook.
- [ ] `README.md` / `README.en.md`: version and channel claims (`@latest` is what it says it is), no `@next` install line unless a pre-release is being announced as such.
- [ ] `SKILL.md` §0.5 install line and `docs/v2/guide/01-quickstart.md` install line: stable channel.
- [ ] `docs/CLI.md` status line, `docs/CAPABILITY-MATRIX.md` status line and distribution section.
- [ ] Active RFC / plan documents whose channel policy the release changed get a dated "生效修订" note; history keeps its original text.
- [ ] GitHub repository About (description, topics, homepage) still describes the product that was just released — cannot be checked from the repository, do it by hand.
- [ ] GitHub Release marked Latest for a stable release, not for a pre-release.
- [ ] Claude Code plugin: if `plugins/buildbeat/.claude-plugin/plugin.json` changed, its version bumped and `tests/plugin-marketplace.test.sh` updated; the plugin version is independent of the npm version.
- [ ] `npm run check:docs` green on the release commit (it enforces the active-document claims above).
