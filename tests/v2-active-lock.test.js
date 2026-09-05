import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { acquireLock, listHeldRunLocks, releaseLock } from "../src/v2/workspace/workspace-manager.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat-v2.js");
const PRESET = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

test("a start blocked by the repository lock names the run it is queued behind", () => {
  // Real incident: a session waited 3h23m behind another work's run with
  // only "another run is active" to go on.
  const root = mkdtempSync(join(tmpdir(), "bb-v2-lock-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  writeFileSync(
    join(root, "run-config.yaml"),
    ["repo: .", "work: WORK-Q", "run: RUN-Q", `workflow: ${PRESET}`, "riskPreset: fast", "entry: build", "workers:", "  builder:", "    command: bash", "    args:", "      - -lc", "      - 'true'"].join("\n"),
  );
  acquireLock(root, "active-run");
  acquireLock(root, "RUN-BUSY");
  try {
    assert.deepEqual(listHeldRunLocks(root), ["RUN-BUSY"]);
    const result = spawnSync(process.execPath, [CLI, "start", "--config", join(root, "run-config.yaml")], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /blocked by RUN-BUSY: \(no ledger found\)/);
    assert.match(result.stderr, /watch it: buildbeat-v2 status --repo <repo-path> --run RUN-BUSY/);
    assert.match(result.stderr, /queue position/);
    assert.match(result.stderr, /error: another run is active/);
    assert.doesNotMatch(result.stderr, new RegExp(root));
  } finally {
    releaseLock(root, "RUN-BUSY");
    releaseLock(root, "active-run");
  }
});
