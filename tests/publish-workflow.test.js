import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const PUBLISH_SCRIPT = path.join(REPO_ROOT, ".github", "scripts", "publish-candidate.sh");
const CANDIDATE_INTEGRITY = `sha512-${"A".repeat(86)}==`;
const DIFFERENT_INTEGRITY = `sha512-${"B".repeat(86)}==`;

function fixture(t, { views, publishStatus }) {
  const root = mkdtempSync(path.join(os.tmpdir(), "buildbeat-publish-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const bin = path.join(root, "bin");
  const state = path.join(root, "state");
  const tarball = path.join(root, "haiyangbg-buildbeat-1.20.0.tgz");
  mkdirSync(bin);
  mkdirSync(state);
  writeFileSync(tarball, "reviewed candidate\n");
  writeFileSync(path.join(state, "view-responses"), `${views.join("\n")}\n`);
  writeFileSync(path.join(state, "publish-calls"), "");

  const npm = path.join(bin, "npm");
  writeFileSync(
    npm,
    `#!/usr/bin/env bash
set -euo pipefail
case "\${1:-}" in
  view)
    count_file="$MOCK_STATE_DIR/view-count"
    count=0
    if [[ -f "$count_file" ]]; then
      count="$(<"$count_file")"
    fi
    count=$((count + 1))
    printf '%s\n' "$count" > "$count_file"
    response="$(sed -n "\${count}p" "$MOCK_STATE_DIR/view-responses")"
    case "$response" in
      __EMPTY__) exit 0 ;;
      __ERROR__) exit 1 ;;
      *) printf '%s\n' "$response" ;;
    esac
    ;;
  publish)
    printf '%s\n' "$*" >> "$MOCK_STATE_DIR/publish-calls"
    exit "$MOCK_PUBLISH_STATUS"
    ;;
  *)
    echo "Unexpected mocked npm command: $*" >&2
    exit 97
    ;;
esac
`,
  );
  chmodSync(npm, 0o755);

  const run = () => spawnSync("bash", [PUBLISH_SCRIPT], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
      MOCK_STATE_DIR: state,
      MOCK_PUBLISH_STATUS: String(publishStatus),
      BUILDBEAT_PACKAGE_NAME: "@haiyangbg/buildbeat",
      BUILDBEAT_PACKAGE_VERSION: "1.20.0",
      BUILDBEAT_CANDIDATE_INTEGRITY: CANDIDATE_INTEGRITY,
      BUILDBEAT_CANDIDATE_TARBALL: tarball,
      BUILDBEAT_RECONCILE_ATTEMPTS: "3",
      BUILDBEAT_RECONCILE_DELAY_SECONDS: "0",
    },
  });
  const publishCalls = () => readFileSync(path.join(state, "publish-calls"), "utf8");
  return { run, publishCalls };
}

test("publishes an absent version", (t) => {
  const mock = fixture(t, { views: ["__EMPTY__"], publishStatus: 0 });
  const result = mock.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(mock.publishCalls(), /publish .*haiyangbg-buildbeat-1\.20\.0\.tgz --access public/);
});

test("accepts an existing version only when integrity matches exactly", (t) => {
  const mock = fixture(t, { views: [CANDIDATE_INTEGRITY], publishStatus: 99 });
  const result = mock.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already contains the exact candidate/);
  assert.equal(mock.publishCalls(), "");
});

test("rejects an existing version with different integrity", (t) => {
  const mock = fixture(t, { views: [DIFFERENT_INTEGRITY], publishStatus: 0 });
  const result = mock.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /already exists with different integrity/);
  assert.equal(mock.publishCalls(), "");
});

test("reconciles a failed publish response when the exact artifact appears", (t) => {
  const mock = fixture(t, {
    views: ["__EMPTY__", "__EMPTY__", CANDIDATE_INTEGRITY],
    publishStatus: 42,
  });
  const result = mock.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /registry reconciliation proved the exact candidate on attempt 2/);
  assert.notEqual(mock.publishCalls(), "");
});

test("preserves the publish failure when reconciliation cannot prove the artifact", (t) => {
  const mock = fixture(t, {
    views: ["__EMPTY__", "__EMPTY__", "__EMPTY__", "__EMPTY__"],
    publishStatus: 42,
  });
  const result = mock.run();
  assert.equal(result.status, 42);
  assert.match(result.stderr, /exact candidate could not be reconciled/);
  assert.notEqual(mock.publishCalls(), "");
});
