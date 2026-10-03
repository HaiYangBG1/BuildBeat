import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { tempDir } from "./support/tmp.js";
const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");
function fixture() {
  const root = tempDir("bb-simple-");
  const git = (...a) =>
    execFileSync("git", ["-C", root, ...a], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  const dir = join(root, "delivery", "work", "WORK-S");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, ".gitignore"), ".buildbeat/\n");
  writeFileSync(join(dir, "work.md"), "# Goal\nBuild feature. Verify it.\n");
  writeFileSync(
    join(root, "worker.sh"),
    `#!/usr/bin/env bash
set -eu
case "$1" in
 build) echo feature > feature.txt; git add feature.txt; git commit -qm feature ;;
 verify) test -f fixed.txt ;;
 fix) echo fixed > fixed.txt; git add fixed.txt; git commit -qm fix ;;
 review) printf '%s\\n' '{"status":"succeeded","findings":[]}' > "$BUILDBEAT_OUTPUT" ;;
esac
`,
  );
  const config = join(dir, "run-config.yaml");
  const text =
    [
      "repo: ../../..",
      "work: WORK-S",
      "run: RUN-S",
      "allowedPaths:",
      "  - feature.txt",
      "  - fixed.txt",
      "workers:",
      ...["builder", "verifier", "reviewer", "fixer"].flatMap((name, i) => [
        `  ${name}:`,
        "    command: bash",
        "    args:",
        "      - worker.sh",
        `      - ${["build", "verify", "review", "fix"][i]}`,
      ]),
    ].join("\n") + "\n";
  writeFileSync(config, text);
  git("add", ".");
  git("commit", "-qm", "fixture");
  const call = (...args) =>
    spawnSync(process.execPath, [CLI, ...args], {
      cwd: root,
      encoding: "utf8",
    });
  const ok = (...args) => {
    const x = call(...args);
    assert.equal(x.status, 0, x.stderr + "\n" + x.stdout);
    return x.stdout;
  };
  return { root, dir, config, text, git, call, ok };
}
test("new work completes the repair loop through the consolidated commands, with frozen approval checks", () => {
  const f = fixture();
  f.ok("accept", "--repo", ".", "--work", "WORK-S", "--by", "owner");
  const before = f.git("status", "--porcelain");
  f.ok("check", "--config", f.config);
  assert.equal(f.git("status", "--porcelain"), before);
  f.ok("run", "--config", f.config);
  let state = JSON.parse(
    f.ok("status", "--repo", ".", "--run", "RUN-S-01", "--json"),
  ).state;
  assert.equal(state.pendingHuman.transition, "enter-wait-merge");
  assert.equal(state.steps.verify.attempts, 2);
  assert.equal(state.steps.fix.attempts, 1);
  assert.equal(state.run.deliveryChecks.artifact, "work");
  f.ok("run", "--config", f.config);
  assert.equal(
    existsSync(join(f.root, ".buildbeat/runtime/runs/RUN-S-02")),
    false,
  );
  f.ok(
    "decide",
    "--repo",
    ".",
    "--run",
    "RUN-S-01",
    "--action",
    "approve",
    "--transition",
    "enter-wait-merge",
    "--by",
    "owner",
  );
  state = JSON.parse(
    f.ok("status", "--repo", ".", "--run", "RUN-S-01", "--json"),
  ).state;
  assert.equal(state.terminal.status, "SUCCEEDED");
  f.ok("history", "--repo", ".", "--run", "RUN-S-01", "--verify");
  const overview = JSON.parse(
    f.ok("status", "--repo", ".", "--work", "WORK-S", "--json"),
  );
  assert.equal(overview.works[0].workArtifact, "work");
});
test("editing a unified work artifact prevents final approval even without --config", () => {
  const f = fixture();
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  const decisions = readFileSync(join(f.dir, "decisions.jsonl"), "utf8");
  writeFileSync(join(f.dir, "work.md"), "changed scope");
  const no = f.call(
    "decide",
    "--repo",
    ".",
    "--run",
    "RUN-S-01",
    "--action",
    "approve",
    "--transition",
    "enter-wait-merge",
  );
  assert.notEqual(no.status, 0);
  assert.match(no.stderr, /work artifact changed/);
  assert.equal(readFileSync(join(f.dir, "decisions.jsonl"), "utf8"), decisions);
});
test("resume refuses changed safeguards instead of silently changing the contract", () => {
  const f = fixture();
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  writeFileSync(f.config, f.text + "maxReviewSeverity: P3\n");
  const no = f.call("run", "--config", f.config);
  assert.notEqual(no.status, 0);
  assert.match(no.stderr, /safeguards changed/);
});
test("retired execution fails before workers or migration side effects", () => {
  const f = fixture();
  mkdirSync(join(f.root, ".buildbeat"), { recursive: true });
  const old = join(f.root, ".buildbeat", "observe.yaml");
  writeFileSync(old, "historical settings");
  const no = f.call("observe", "run", "--config", old);
  assert.notEqual(no.status, 0);
  assert.match(no.stderr, /retired/);
  assert.equal(readFileSync(old, "utf8"), "historical settings");
  writeFileSync(f.config, f.text + "policies:\n  - custom.yaml\n");
  const rejected = f.call("run", "--config", f.config);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /custom policy files are retired/);
  assert.equal(existsSync(join(f.root, ".buildbeat", "runtime")), false);
  writeFileSync(f.config, f.text + "workflow: custom.yaml\n");
  writeFileSync(
    join(f.dir, "custom.yaml"),
    "kind: workflow\nversion: 1\nname: release-readback\n",
  );
  const custom = f.call("run", "--config", f.config);
  assert.notEqual(custom.status, 0);
  assert.match(custom.stderr, /retired/);
  assert.equal(existsSync(join(f.root, "feature.txt")), false);
});
test("a controlled legacy configuration cannot be weakened by a new severity option", () => {
  const f = fixture();
  writeFileSync(
    f.config,
    f.text + "riskPreset: controlled\nmaxReviewSeverity: P2\n",
  );
  const no = f.call("run", "--config", f.config);
  assert.notEqual(no.status, 0);
  assert.match(no.stderr, /cannot weaken/);
});

test("legacy active ledgers remain readable but cannot be resumed or approved with unproven safeguards", () => {
  const f = fixture();
  const path = join(
    f.root,
    ".buildbeat",
    "runtime",
    "runs",
    "RUN-S-01",
    "events.jsonl",
  );
  const ledger = new EventLedger(path);
  ledger.append({
    type: "RUN_CREATED",
    actor: { kind: "kernel", id: "legacy-fixture" },
    run: "RUN-S-01",
    work: "WORK-S",
    data: {
      workflowRef: "software-delivery",
      workflowDigest: "sha256:legacy",
      base: f.git("rev-parse", "HEAD"),
      riskPreset: "standard",
    },
  });
  const original = readFileSync(path, "utf8");
  f.ok("status", "--repo", ".", "--run", "RUN-S-01");
  const resumed = f.call("run", "--config", f.config);
  assert.notEqual(resumed.status, 0);
  assert.match(resumed.stderr, /legacy active run/);
  const approved = f.call(
    "decide",
    "--repo",
    ".",
    "--run",
    "RUN-S-01",
    "--action",
    "approve",
    "--transition",
    "enter-wait-merge",
  );
  assert.notEqual(approved.status, 0);
  assert.match(approved.stderr, /legacy active run/);
  assert.equal(readFileSync(path, "utf8"), original);
});

test("an adopt request with changed safeguards is refused before writing a candidate decision", () => {
  const f = fixture();
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  const path = join(
    f.root,
    ".buildbeat",
    "runtime",
    "runs",
    "RUN-S-01",
    "events.jsonl",
  );
  const before = readFileSync(path, "utf8");
  const state = JSON.parse(
    f.ok("status", "--repo", ".", "--run", "RUN-S-01", "--json"),
  ).state;
  writeFileSync(f.config, f.text + "maxReviewSeverity: P3\n");
  const result = f.call(
    "run",
    "--config",
    f.config,
    "--run",
    "RUN-S-01",
    "--adopt",
    state.pendingHuman.subject.candidate,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /safeguards changed/);
  assert.equal(readFileSync(path, "utf8"), before);
});

test("a dismissed finding does not re-block approval after a no-op fix of the same candidate", () => {
  const f = fixture();
  const worker = join(f.root, "worker.sh");
  writeFileSync(
    worker,
    readFileSync(worker, "utf8")
      .replace("test -f fixed.txt", "test -f feature.txt")
      .replace(
        "echo fixed > fixed.txt; git add fixed.txt; git commit -qm fix",
        "true",
      )
      .replace(
        '"findings":[]',
        '"findings":[{"severity":"P1","summary":"false positive"}]',
      ),
  );
  writeFileSync(f.config, f.text + "reviewTriage: required\n");
  f.git("add", "worker.sh", "delivery/work/WORK-S/run-config.yaml");
  f.git("commit", "-qm", "review fixture");
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  const before = JSON.parse(
    f.ok("status", "--repo", ".", "--run", "RUN-S-01", "--json"),
  ).state;
  assert.equal(before.pendingHuman.transition, "enter-fix");
  const card = JSON.parse(
    f.ok("status", "--repo", ".", "--work", "WORK-S", "--json"),
  );
  const fingerprint = card.works[0].findings[0].fingerprint;
  f.ok(
    "decide",
    "--repo",
    ".",
    "--work",
    "WORK-S",
    "--action",
    "dismiss",
    "--fingerprint",
    fingerprint,
    "--by",
    "owner",
  );
  f.ok(
    "decide",
    "--repo",
    ".",
    "--run",
    "RUN-S-01",
    "--action",
    "approve",
    "--transition",
    "enter-fix",
  );
  f.ok("run", "--config", f.config);
  const after = JSON.parse(
    f.ok("status", "--repo", ".", "--run", "RUN-S-01", "--json"),
  ).state;
  assert.equal(
    after.pendingHuman.subject.candidate,
    before.pendingHuman.subject.candidate,
  );
  assert.equal(after.pendingHuman.transition, "enter-wait-merge");
  f.ok(
    "decide",
    "--repo",
    ".",
    "--run",
    "RUN-S-01",
    "--action",
    "approve",
    "--transition",
    "enter-wait-merge",
  );
});

test("scoped text status only offers decisions for the selected work", () => {
  const f = fixture();
  const second = join(f.root, "delivery", "work", "WORK-B");
  mkdirSync(second, { recursive: true });
  writeFileSync(join(second, "work.md"), "Another independent work");
  writeFileSync(
    join(second, "run-config.yaml"),
    f.text.replaceAll("WORK-S", "WORK-B").replaceAll("RUN-S", "RUN-B"),
  );
  f.git("add", "delivery/work/WORK-B");
  f.git("commit", "-qm", "second work");
  for (const [work, config] of [
    ["WORK-S", f.config],
    ["WORK-B", join(second, "run-config.yaml")],
  ]) {
    f.ok("accept", "--repo", ".", "--work", work);
    f.ok("run", "--config", config);
  }
  const scoped = f.ok("status", "--repo", ".", "--work", "WORK-S");
  assert.match(scoped, /RUN-S-01/);
  assert.doesNotMatch(scoped, /WORK-B|RUN-B/);
});

test("an unaccepted work.md draft is discoverable before any decision or run exists", () => {
  const f = fixture();
  const json = JSON.parse(
    f.ok("status", "--repo", ".", "--work", "WORK-S", "--json"),
  );
  assert.equal(json.works.length, 1);
  assert.equal(json.works[0].stage, "WORK_DRAFT");
  assert.equal(json.works[0].workArtifact, "work");
  assert.match(f.ok("status", "--repo", "."), /work\.md draft/);
  assert.equal(existsSync(join(f.root, ".buildbeat")), false);
});

test("workers cannot start from a different committed work artifact than the accepted one", () => {
  const f = fixture();
  writeFileSync(
    join(f.dir, "work.md"),
    "Changed goal not yet in the selected base",
  );
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  const result = f.call("run", "--config", f.config);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /commit the accepted work artifact/);
  assert.equal(existsSync(join(f.root, ".buildbeat")), false);
  f.git("add", "delivery/work/WORK-S/work.md");
  f.git("commit", "-qm", "accepted scope");
  f.ok("run", "--config", f.config);
});
