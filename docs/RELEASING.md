# BuildBeat CLI package release runbook

This runbook governs BuildBeat's public npm distribution. The canonical package is `@haiyangbg/buildbeat` in `HaiYangBG1/BuildBeat`; the canonical executable is `buildbeat`, while `solobaton` remains an executable alias. The old `solobaton` npm package is a frozen legacy distribution ID and must not receive the scoped write/upgrade command surface.

Release evidence at source package version `@haiyangbg/buildbeat@2.0.0-beta.3`; latest independently verified BuildBeat npm distribution `@haiyangbg/buildbeat@2.0.0-beta.3` (dist-tag `next`; `latest` remains `1.21.0`), anchored by annotated tag `v2.0.0-beta.3` at commit `02d1f5a`, workflow run [33460544343](https://github.com/HaiYangBG1/BuildBeat/actions/runs/33460544343), and archived in [`V2.0.0-BETA.3-RELEASE-EVIDENCE-2026-09-01.md`](V2.0.0-BETA.3-RELEASE-EVIDENCE-2026-09-01.md). The beta.2 chain stays archived in [`V2.0.0-BETA.2-RELEASE-EVIDENCE-2026-08-28.md`](V2.0.0-BETA.2-RELEASE-EVIDENCE-2026-08-28.md); the beta.1 chain stays archived in [`V2.0.0-BETA.1-RELEASE-EVIDENCE-2026-08-28.md`](V2.0.0-BETA.1-RELEASE-EVIDENCE-2026-08-28.md). The latest stable distribution stays `@haiyangbg/buildbeat@1.21.0`, anchored by annotated tag `v1.21.0` at commit `ce69a05`, workflow run [32864438692](https://github.com/HaiYangBG1/BuildBeat/actions/runs/32864438692), and the matching [GitHub Release](https://github.com/HaiYangBG1/BuildBeat/releases/tag/v1.21.0). Exact registry identity, provenance, signatures, isolated-install readback, Environment approval, and immutable-artifact boundary are archived in [`V1.21-RELEASE-EVIDENCE-2026-08-25.md`](V1.21-RELEASE-EVIDENCE-2026-08-25.md). First-scoped-release bootstrap behavior and legacy deprecation remain archived in [`WP4.3-RELEASE-EVIDENCE-2026-08-25.md`](WP4.3-RELEASE-EVIDENCE-2026-08-25.md). The legacy distribution remains `solobaton@1.16.3`; all three published legacy versions are retained and deprecated toward the scoped package.

## Release invariants

1. One npm version maps to one immutable annotated Git tag and one exact source commit. Never move a published version's tag.
2. `CLI_VERSION` comes from `package.json`; the scaffold version is the pinned `SCAFFOLD_VERSION` literal in `src/constants.js` and tracks the frozen v1 scaffold content bundle, not the CLI. Since the v2 package line it stays at `v1.21` until the scaffold surface itself changes — a package release never invents a scaffold upgrade.
3. Publish only from a clean worktree whose `HEAD`, tag target, tested commit, and packed artifact all match.
4. `publishConfig.registry` stays pinned to `https://registry.npmjs.org/`; a developer's mirror configuration must not redirect a public release.
5. A successful `npm publish` response is not enough. Registry metadata, tarball contents, an isolated install, the executable version, and a read-only command must be checked independently.
6. `npm install/update/uninstall` manage the CLI package only. They must never be described as project-scaffold `init/upgrade/uninstall` support.
7. After a version is published, later `main` documentation changes carrying that same `package.json` version do not redefine its artifact and are not releasable candidates. The next publication requires a new package version, Changelog heading, and annotated tag.
8. Canonical examples use `@haiyangbg/buildbeat@latest`, not a hard-coded release number. Reproducible consumers first resolve `npm view @haiyangbg/buildbeat@latest version`, record that exact version, and substitute it for `@latest`; exact release evidence remains in this runbook and the matching GitHub Release. One-off commands use `npx --yes --package=@haiyangbg/buildbeat@latest buildbeat ...`.
9. The active repository ruleset `Protect release tags` must match `refs/tags/v*`, forbid tag updates and deletions, and grant no bypass actor. It deliberately does not forbid creation, so a reviewed new release tag can still be created once.
10. The write-enabled first-screen command `npx --yes --package=@haiyangbg/buildbeat@latest buildbeat init my-project` is active because the exact 1.21 scoped artifact passed registry/provenance/signature/isolated-install/README readback. The old-name WP2.7 pilots remain historical compatibility evidence and do not redefine the scoped artifact.

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

The intended bootstrap readback is `bootstrap: 0.0.0` without a stable `latest` claim. During the first BuildBeat package creation, npm also attached `latest: 0.0.0` despite the explicit non-default tag and rejected the authenticated delete with HTTP 400. Treat any such first-package `latest` as temporary bootstrap exposure: do not activate launch documentation, do not republish or unpublish the immutable version, and complete the reviewed OIDC release so the real version takes over `latest`. The current BuildBeat readback is `bootstrap: 0.0.0` and `latest: 1.21.0`. The bootstrap package page is registry-creation evidence only: it is not a BuildBeat release, is not tagged in Git, and has no provenance claim. The npm documentation requires 2FA or an allowed granular token for direct publication; no long-lived publish token belongs in Git, shell history, logs, or a chat transcript. See npm's guides for [scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/) and [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/).

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
node "$release_probe/node_modules/@haiyangbg/buildbeat/bin/solobaton.js" --version
node "$release_probe/node_modules/@haiyangbg/buildbeat/bin/buildbeat.js" doctor . --json
```

The expected version is exact. `doctor` may correctly return exit 1 for a directory without an installed scaffold; the acceptance condition is valid bounded JSON and zero project writes, not a forced green diagnosis.

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

The workflow waits for exact registry-version readback, requires `dist.attestations` to expose an npm attestation URL with the SLSA v1 provenance predicate, installs the public package into a clean temporary prefix, checks its executable version, and runs `npm audit signatures`. The release operator must still repeat the isolated-install and read-only `doctor` check independently before publishing the matching GitHub Release. Never use `workflow_dispatch` to bypass the repository's human merge or tag Gate.

Trusted Publishing removes the long-lived write token and automatically emits provenance for supported public GitHub repositories. Configure the exact owner, repository, workflow filename, allowed `npm publish` action, and the exact `npm-publish` environment on npmjs.com. A GitHub Environment without the matching npm-side environment binding is not sufficient evidence. See npm's [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) and [provenance](https://docs.npmjs.com/generating-provenance-statements/) documentation.

The bootstrap `0.0.0` package is not retroactively provenance-backed and must remain on the non-default `bootstrap` tag. The existence of the workflow and trusted-publisher binding is configuration evidence only; npm validates the binding during the real publish. After the first OIDC release succeeds, set `npm access set mfa=publish @haiyangbg/buildbeat` and independently read back npm's most restrictive Publishing access option, currently labeled `Require two-factor authentication and disallow bypass 2fa tokens (recommended)`, while preserving the Trusted Publisher. Then deprecate every legacy `solobaton` version with a concise migration pointer to `@haiyangbg/buildbeat`; do not unpublish it, because existing read-only installations and redirects remain useful compatibility paths. Because package access, trust, tags, and deprecation are mutable registry state, future release operators must recheck them live.
