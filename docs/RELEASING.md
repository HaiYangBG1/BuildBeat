# CLI package release runbook

This runbook governs the public npm package. It does not authorize project-scaffold writes, a Git merge, or a production rollout. Each state transition still requires its own human Gate.

## Release invariants

1. One npm version maps to one immutable annotated Git tag and one exact source commit. Never move a published version's tag.
2. `CLI_VERSION` comes from `package.json`; the scaffold version is its major/minor pair. A CLI patch release such as `1.16.2` does not invent a scaffold upgrade beyond `v1.16`.
3. Publish only from a clean worktree whose `HEAD`, tag target, tested commit, and packed artifact all match.
4. `publishConfig.registry` stays pinned to `https://registry.npmjs.org/`; a developer's mirror configuration must not redirect a public release.
5. A successful `npm publish` response is not enough. Registry metadata, tarball contents, an isolated install, the executable version, and a read-only command must be checked independently.
6. `npm install/update/uninstall` manage the CLI package only. They must never be described as project-scaffold `init/upgrade/uninstall` support.

## Candidate checks

Run from the exact release candidate:

```bash
npm ci --ignore-scripts --no-audit --no-fund
bash -n templates/scripts/*.sh tests/*.sh
shellcheck -x templates/scripts/*.sh tests/*.sh
actionlint
bash tests/check-docs.sh
bash tests/test-scripts.sh
npm test
npm publish --dry-run --access public --registry=https://registry.npmjs.org/
gitleaks git --no-banner --redact --no-color
git diff --check
```

Before pushing a tag, confirm that the package name/version is absent from the official registry and that the candidate commit's `main` CI is green. An `E404` only proves point-in-time absence; it does not reserve the name.

## Initial public package bootstrap

The first package must be created by an npm account protected by 2FA, or by another npm-supported initial-publication credential. Solobaton completed this one-time bootstrap with `1.16.1`. Use the official web login rather than copying a token into the repository:

```bash
npm login --auth-type=web --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm publish --access public --registry=https://registry.npmjs.org/
```

The npm documentation requires 2FA or an allowed granular token for package publication. Solobaton's initial release uses interactive 2FA; no long-lived publish token belongs in Git, shell history, logs, or a chat transcript. See npm's guides for [unscoped public packages](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/) and [publishing 2FA requirements](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/).

## Independent readback

After publication, query the public registry explicitly and install into a new temporary prefix:

```bash
release_version="$(node -p "require('./package.json').version")"

npm view "solobaton@$release_version" name version dist-tags.latest \
  --registry=https://registry.npmjs.org/

release_probe="$(mktemp -d)"
npm install --prefix "$release_probe" "solobaton@$release_version" \
  --registry=https://registry.npmjs.org/ --ignore-scripts --no-audit --no-fund
node "$release_probe/node_modules/solobaton/bin/solobaton.js" --version
node "$release_probe/node_modules/solobaton/bin/solobaton.js" doctor . --json
```

The expected version is exact. `doctor` may correctly return exit 1 for a directory without an installed scaffold; the acceptance condition is valid bounded JSON and zero project writes, not a forced green diagnosis.

Only after this readback should the matching GitHub Release be published and documentation treat the npm version as independently verified.

## Trusted Publishing releases

The public npm package is bound to this repository and `.github/workflows/publish.yml`. The workflow is deliberately manual: a human supplies one exact annotated tag only after the release commit is the current `main` HEAD and its CI is green. It uses a GitHub-hosted runner, Node 24, pinned npm 11.19.0, `contents: read`, and job-scoped `id-token: write`; it rejects a non-semantic or lightweight tag, any dispatch outside `main`, a tag/checkout/event/remote-HEAD mismatch, a package-version mismatch, an existing immutable registry version, or failed release checks.

Bind the npm package to the exact workflow after that workflow exists on the default branch:

```bash
npx --yes npm@11.19.0 trust github solobaton \
  --file publish.yml \
  --repo HaiYangBG1/solobaton \
  --allow-publish \
  --registry=https://registry.npmjs.org/
```

For a new version, push the reviewed annotated tag, wait for its `main` CI, then trigger the workflow and verify it before creating the GitHub Release:

```bash
gh workflow run publish.yml -f tag=vX.Y.Z
gh run watch --exit-status
```

The workflow waits for exact registry-version readback, requires `dist.attestations` to expose an npm attestation URL with the SLSA v1 provenance predicate, installs the public package into a clean temporary prefix, checks its executable version, and runs `npm audit signatures`. The release operator must still repeat the isolated-install and read-only `doctor` check independently before publishing the matching GitHub Release. Never use `workflow_dispatch` to bypass the repository's human merge or tag Gate.

Trusted Publishing removes the long-lived write token and automatically emits provenance for supported public GitHub repositories. Configure the exact owner, repository, workflow filename, allowed `npm publish` action, and—if used—the GitHub environment on npmjs.com. See npm's [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) and [provenance](https://docs.npmjs.com/generating-provenance-statements/) documentation.

The first manually published version is not retroactively provenance-backed. Record that evidence boundary in its GitHub Release instead of implying otherwise. The existence of the workflow and trusted-publisher binding is configuration evidence only; npm explicitly validates the binding only during a real publish. After the first OIDC release succeeds, separately set npm publishing access to require 2FA and disallow traditional tokens. That account-governance change is not part of a repository merge or package release Gate.
