import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { acceptArtifact } from "../src/v2/runtime/decisions.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat-v2.js");
const PRESET = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function cli(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

test("doctor reads the same work-artifact preconditions start's first gate will read", () => {
  // Real incident, twice: doctor passed, start stopped at build because
  // plan.md had not been mirrored into the repository the run was started in.
  const root = mkdtempSync(join(tmpdir(), "bb-v2-doctor-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  writeFileSync(
    join(root, "run-config.yaml"),
    [
      "repo: .",
      "work: WORK-DOC",
      "run: RUN-DOC",
      `workflow: ${PRESET}`,
      "riskPreset: standard",
      "entry: build",
      "budgets:",
      "  maxAttempts:",
      "    review: 3",
      "  reviewRoundsPerWork: 6",
      "workers:",
      "  builder:",
      "    command: bash",
      "    args:",
      "      - -lc",
      "      - 'true'",
    ].join("\n"),
  );

  const missing = cli(["doctor", "--config", join(root, "run-config.yaml")]);
  assert.match(missing, /intent\.md: MISSING/);
  assert.match(missing, /plan\.md: MISSING/);
  assert.match(missing, /WARNING policy plan-accepted \(pre build\) needs an accepted plan\.md; start will stop at build \(file missing here/);
  assert.match(missing, /budgets \(maxAttempts per step.*review=3 \(run config\)/);
  assert.match(missing, /budgets\.reviewRoundsPerWork: 6/);

  const dir = join(root, "delivery", "work", "WORK-DOC");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "intent.md"), "# why\n");
  writeFileSync(join(dir, "plan.md"), "# how\n");
  const draft = cli(["doctor", "--config", join(root, "run-config.yaml")]);
  assert.match(draft, /plan\.md: draft \(not accepted\)/);
  assert.match(draft, /start will stop at build \(accept it first\)/);

  acceptArtifact(root, "WORK-DOC", "plan", { by: "owner" });
  const accepted = cli(["doctor", "--config", join(root, "run-config.yaml")]);
  assert.match(accepted, /plan\.md: accepted by owner/);
  assert.doesNotMatch(accepted, /WARNING policy plan-accepted/);
});
