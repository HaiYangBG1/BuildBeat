import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const CLI = join(import.meta.dirname, "..", "src", "v2", "cli", "run.js");
const PRESET = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function cli(args) {
  return execFileSync("node", [CLI, ...args], { encoding: "utf8" });
}

test("run start, status, and stop work end to end through the CLI", () => {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-cli-"));
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
      "work: WORK-CLI",
      "run: RUN-CLI",
      `workflow: ${PRESET}`,
      "entry: build",
      "stopAt:",
      "  - review",
      "workers:",
      "  builder:",
      "    command: bash",
      "    args:",
      "      - -lc",
      "      - 'echo done > feature.txt && git add -A && git commit -qm candidate'",
      "  verifier:",
      "    command: bash",
      "    args:",
      "      - -lc",
      "      - test -f feature.txt",
    ].join("\n"),
  );

  const startOut = cli(["start", "--config", join(root, "run-config.yaml")]);
  assert.match(startOut, /status: WAITING_HUMAN/);
  assert.match(startOut, /waiting on human: enter-review/);
  assert.match(startOut, /candidate (?!\(none\))/);

  const statusOut = cli(["status", "--repo", root, "--run", "RUN-CLI"]);
  assert.match(statusOut, /status: WAITING_HUMAN/);
  assert.match(statusOut, /step build: SUCCEEDED/);
  assert.match(statusOut, /step verify: SUCCEEDED/);

  const stopOut = cli(["stop", "--repo", root, "--run", "RUN-CLI", "--reason", "test-cancel"]);
  assert.match(stopOut, /cancelled and compacted/);
  assert.ok(
    existsSync(join(root, "delivery", "work", "WORK-CLI", "runs", "RUN-CLI", "run-record.json")),
  );

  const stopAgain = cli(["stop", "--repo", root, "--run", "RUN-CLI"]);
  assert.match(stopAgain, /already terminal: CANCELLED/);
});
