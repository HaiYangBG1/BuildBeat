import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");
const PRESET = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function cli(args, env) {
  return execFileSync("node", [CLI, ...args], {
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
  });
}

function fixtureRepo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return root;
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
      "riskPreset: fast",
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
  assert.doesNotMatch(startOut, new RegExp(root));

  const statusOut = cli(["status", "--repo", root, "--run", "RUN-CLI"]);
  assert.match(statusOut, /status: WAITING_HUMAN/);
  assert.match(statusOut, /step build: SUCCEEDED/);
  assert.match(statusOut, /step verify: SUCCEEDED/);
  assert.doesNotMatch(statusOut, new RegExp(root));

  const stopOut = cli(["stop", "--repo", root, "--run", "RUN-CLI", "--reason", "test-cancel"]);
  assert.match(stopOut, /cancelled and compacted/);
  assert.ok(
    existsSync(join(root, "delivery", "work", "WORK-CLI", "runs", "RUN-CLI", "run-record.json")),
  );
  assert.doesNotMatch(
    readFileSync(
      join(root, "delivery", "work", "WORK-CLI", "runs", "RUN-CLI", "run-record.json"),
      "utf8",
    ),
    new RegExp(root),
  );

  const stopAgain = cli(["stop", "--repo", root, "--run", "RUN-CLI"]);
  assert.match(stopAgain, /already terminal: CANCELLED/);

  const eventsOut = cli(["events", "--repo", root, "--run", "RUN-CLI"]);
  assert.match(eventsOut, /1\t.*\tRUN_CREATED/);
  assert.match(eventsOut, /RUN_COMPACTED/);

  const replayOut = cli(["replay", "--repo", root, "--run", "RUN-CLI"]);
  assert.match(replayOut, /chain OK: \d+ events verified/);
  assert.match(replayOut, /terminal: CANCELLED/);

  const doctorOut = cli(["doctor", "--config", join(root, "run-config.yaml")]);
  assert.match(doctorOut, /risk preset: fast/);
  assert.match(doctorOut, /merge-evidence-floor.*LOCAL_ENFORCED \(approve gate/);
  assert.match(doctorOut, /builder: env allowlist/);
  assert.match(doctorOut, /no remotes/);

  writeFileSync(join(root, "delivery", "work", "WORK-CLI", "plan.md"), "the plan\n");
  const acceptOut = cli(["accept", "--repo", root, "--work", "WORK-CLI", "--artifact", "plan", "--by", "owner"]);
  assert.match(acceptOut, /accepted plan as A-WORK-CLI-\d+/);
  assert.match(acceptOut, /digest: sha256:/);
});

// Real incident class: the adapter guide documents `env:` and `inheritEnv`,
// doctor reported them, but the CLI loader dropped both before the adapter
// saw them — start ran a different env posture than doctor described.
test("run config env posture reaches the worker through the CLI", () => {
  const hostEnv = { BB_HOST_SECRET: "must-not-leak" };

  const allowlisted = fixtureRepo("bb-v2-cli-env-");
  writeFileSync(
    join(allowlisted, "run-config.yaml"),
    [
      "repo: .",
      "work: WORK-ENV",
      "run: RUN-ENV",
      `workflow: ${PRESET}`,
      "riskPreset: fast",
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
      "    env:",
      "      BB_PROBE: hello",
      "      BB_PORT: 8080",
      "    args:",
      "      - -lc",
      "      - 'test \"$BB_PROBE\" = hello && test \"$BB_PORT\" = 8080 && test -z \"$BB_HOST_SECRET\"'",
    ].join("\n"),
  );
  const doctorOut = cli(["doctor", "--config", join(allowlisted, "run-config.yaml")], hostEnv);
  assert.match(doctorOut, /verifier: env allowlist/);
  const startOut = cli(["start", "--config", join(allowlisted, "run-config.yaml")], hostEnv);
  assert.match(startOut, /status: WAITING_HUMAN/);
  assert.match(startOut, /waiting on human: enter-review/);
  const statusOut = cli(["status", "--repo", allowlisted, "--run", "RUN-ENV"], hostEnv);
  assert.match(statusOut, /step verify: SUCCEEDED/);

  const inherited = fixtureRepo("bb-v2-cli-env-inherit-");
  writeFileSync(
    join(inherited, "run-config.yaml"),
    [
      "repo: .",
      "work: WORK-ENV",
      "run: RUN-ENV",
      `workflow: ${PRESET}`,
      "riskPreset: fast",
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
      "    inheritEnv: true",
      "    args:",
      "      - -lc",
      "      - 'test \"$BB_HOST_SECRET\" = must-not-leak'",
    ].join("\n"),
  );
  const inheritDoctor = cli(["doctor", "--config", join(inherited, "run-config.yaml")], hostEnv);
  assert.match(inheritDoctor, /verifier: WARNING inherit/);
  cli(["start", "--config", join(inherited, "run-config.yaml")], hostEnv);
  const inheritStatus = cli(["status", "--repo", inherited, "--run", "RUN-ENV"], hostEnv);
  assert.match(inheritStatus, /step verify: SUCCEEDED/);

  const broken = fixtureRepo("bb-v2-cli-env-bad-");
  writeFileSync(
    join(broken, "run-config.yaml"),
    [
      "repo: .",
      "work: WORK-ENV",
      "run: RUN-ENV",
      `workflow: ${PRESET}`,
      "riskPreset: fast",
      "entry: build",
      "workers:",
      "  verifier:",
      "    command: bash",
      "    env:",
      "      bad-name: x",
    ].join("\n"),
  );
  assert.throws(
    () => cli(["doctor", "--config", join(broken, "run-config.yaml")], hostEnv),
    /workers\.verifier\.env: invalid variable name/,
  );
});
