import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { tempDir } from "./support/tmp.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");
const PRESET = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");

function cli(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function fails(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  return result.stderr;
}

function fixture(t, family = "RUN-FAMILY") {
  const root = tempDir("bb-resume-family-");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-qm", "baseline");
  function config(run = family) {
    const path = join(root, `${run}.yaml`);
    writeFileSync(path, [
      "repo: .", "work: WORK-FAMILY", `run: ${run}`, `workflow: ${PRESET}`,
      "riskPreset: fast", "entry: build", "supersede: off", "stopAt:", "  - review", "workers:",
      ...["builder", "verifier", "reviewer"].flatMap((worker) => [
        `  ${worker}:`, `    command: ${process.execPath}`, "    args:", "      - -e",
        '      - \'require("node:fs").writeFileSync(process.env.BUILDBEAT_OUTPUT, JSON.stringify({status: "succeeded", findings: []}))\'',
      ]),
    ].join("\n"));
    return path;
  }
  const path = config();
  const ledgerPath = (id) => join(root, ".buildbeat", "runtime", "runs", id, "events.jsonl");
  return {
    root, path, family, config, git, ledgerPath,
    state: (id) => EventLedger.open(ledgerPath(id)).state,
    start: (selected = path, numbered = true) => cli(["start", "--config", selected, ...(numbered ? ["--attempt", "new"] : [])]),
    approve: (id) => cli(["approve", "--repo", root, "--run", id, "--transition", "enter-review"]),
    stop: (id) => cli(["stop", "--repo", root, "--run", id, "--reason", "fixture finished"]),
  };
}

for (const explicit of [false, true]) {
  test(`numbered run resumes after approval with ${explicit ? "explicit --run" : "family config"}`, (t) => {
    const f = fixture(t);
    const id = `${f.family}-01`;
    assert.match(f.start(), /attempt: RUN-FAMILY-01/);
    assert.equal(f.state(id).pendingHuman.transition, "enter-review");
    const approved = f.approve(id);
    assert.match(approved, /decision recorded; continue with: buildbeat resume --config <run-config.yaml> --run RUN-FAMILY-01/);
    assert.doesNotMatch(approved, /run\.js/);
    const out = cli(["resume", "--config", f.path, ...(explicit ? ["--run", id] : [])]);
    if (!explicit) assert.match(out, /resuming RUN-FAMILY-01 \(the open run of family RUN-FAMILY\)/);
    assert.match(out, /run: RUN-FAMILY-01 /);
    assert.match(out, /waiting on human: enter-wait-merge/);
    assert.equal(f.state(id).steps.review.attempts, 1);
    assert.equal(existsSync(f.ledgerPath(f.family)), false);
  });
}

test("explicit run rejects other families and missing ledgers without changing a run", (t) => {
  const f = fixture(t);
  f.start();
  const before = readFileSync(f.ledgerPath("RUN-FAMILY-01"), "utf8");
  for (const id of ["OTHER-01", "RUN-FAMILY-B-01", "RUN-FAMILY-1", "RUN-FAMILY-01-extra"]) {
    assert.ok(fails(["resume", "--config", f.path, "--run", id]).includes(`--run ${id} is not in run family RUN-FAMILY of this config`));
  }
  assert.match(fails(["resume", "--config", f.path, "--run", "RUN-FAMILY-02"]), /no ledger for run RUN-FAMILY-02/);
  assert.equal(readFileSync(f.ledgerPath("RUN-FAMILY-01"), "utf8"), before);
});

test("no open run reports the latest terminal attempt and permits explicit terminal selection", (t) => {
  const f = fixture(t);
  f.start();
  f.stop("RUN-FAMILY-01");
  assert.match(fails(["resume", "--config", f.path]), /no open run in family RUN-FAMILY; latest run RUN-FAMILY-01: CANCELLED/);
  // Numeric ordering must still work after the two-digit attempt range.
  for (const suffix of ["99", "100"]) {
    f.start(f.config(`RUN-FAMILY-${suffix}`), false);
    f.stop(`RUN-FAMILY-${suffix}`);
  }
  assert.match(fails(["resume", "--config", f.path]), /latest run RUN-FAMILY-100: CANCELLED/);
  const out = cli(["resume", "--config", f.path, "--run", "RUN-FAMILY-01"]);
  assert.match(out, /nothing to resume:/);
  assert.match(out, /terminal: CANCELLED/);
});

test("missing family ledgers give an actionable error and ignore unrelated or empty directories", (t) => {
  const f = fixture(t);
  assert.match(fails(["resume", "--config", f.path]), /no open run in family RUN-FAMILY; no ledgers found; use --run <RUN-ID>/);
  f.start(f.config("RUN-FAMILY-B"));
  mkdirSync(join(f.root, ".buildbeat", "runtime", "runs", "RUN-FAMILY-02"));
  assert.match(fails(["resume", "--config", f.path]), /no open run in family RUN-FAMILY; no ledgers found/);
});

test("multiple open runs are listed without mutation and --run disambiguates", (t) => {
  const f = fixture(t);
  f.start();
  f.start();
  f.approve("RUN-FAMILY-02");
  const before = ["01", "02"].map((suffix) => readFileSync(f.ledgerPath(`RUN-FAMILY-${suffix}`), "utf8"));
  assert.match(fails(["resume", "--config", f.path]), /multiple open runs in family RUN-FAMILY: RUN-FAMILY-01, RUN-FAMILY-02; use --run <RUN-ID>/);
  assert.deepEqual(["01", "02"].map((suffix) => readFileSync(f.ledgerPath(`RUN-FAMILY-${suffix}`), "utf8")), before);
  assert.match(cli(["resume", "--config", f.path, "--run", "RUN-FAMILY-02"]), /waiting on human: enter-wait-merge/);
  assert.equal(f.state("RUN-FAMILY-01").pendingHuman.transition, "enter-review");
});

for (const explicit of [false, true]) {
  test(`exact run config keeps precedence over numbered siblings${explicit ? " with --run equal to config" : ""}`, (t) => {
    const f = fixture(t, "RUN-EXACT-01");
    f.start(f.path, false);
    f.start();
    f.approve(f.family);
    const out = cli(["resume", "--config", f.path, ...(explicit ? ["--run", f.family] : [])]);
    assert.match(out, /run: RUN-EXACT-01 /);
    assert.match(out, /waiting on human: enter-wait-merge/);
    assert.doesNotMatch(out, /the open run of family/);
    assert.equal(f.state("RUN-EXACT-01-01").pendingHuman.transition, "enter-review");
    f.stop(f.family);
    assert.match(cli(["resume", "--config", f.path]), /terminal: CANCELLED/);
  });
}

test("family matching escapes regex characters and ignores terminal siblings", (t) => {
  // "." is a regex metacharacter allowed in run ids; RUNxFAMILY would match
  // an unescaped family pattern.
  const f = fixture(t, "RUN.FAMILY");
  f.start(f.config("RUNxFAMILY"));
  f.start();
  f.stop("RUN.FAMILY-01");
  f.start();
  f.approve("RUN.FAMILY-02");
  const out = cli(["resume", "--config", f.path]);
  assert.ok(out.includes("resuming RUN.FAMILY-02 (the open run of family RUN.FAMILY)"));
  assert.match(out, /waiting on human: enter-wait-merge/);
  assert.match(fails(["resume", "--config", f.path, "--run", "RUNxFAMILY-01"]), /is not in run family/);
});

test("adopt resolves the family before recording the candidate decision", (t) => {
  const f = fixture(t);
  f.start();
  const sha = f.git("rev-parse", "HEAD");
  const out = cli(["resume", "--config", f.path, "--adopt", sha, "--by", "test"]);
  assert.match(out, /adopted .* as candidate \(D-RUN-FAMILY-01-/);
  assert.equal(f.state("RUN-FAMILY-01").steps.verify.attempts, 2);
  assert.equal(existsSync(f.ledgerPath(f.family)), false);
});

test("help advertises explicit resume selection", () => {
  assert.match(cli([]), /buildbeat resume --config <run-config.yaml> \[--run <RUN-ID>\]/);
});
