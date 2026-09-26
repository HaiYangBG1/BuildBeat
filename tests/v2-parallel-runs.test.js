import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { EventLedger } from "../src/v2/storage/event-ledger.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");
const PRESET = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");

// A repository with two works whose verifiers sleep while `hang` exists and
// log when they ran, so overlap (or its absence) is observable.
function repo(t) {
  const root = mkdtempSync(join(tmpdir(), "bb-parallel-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-qm", "baseline");
  const hang = join(root, "hang");
  const timeline = join(root, "timeline.jsonl");
  const envelope = '      - \'require("node:fs").writeFileSync(process.env.BUILDBEAT_OUTPUT, JSON.stringify({status: "succeeded", findings: []}))\'';
  const verifier = `      - 'const fs = require("node:fs"); const start = Date.now(); const input = JSON.parse(process.env.BUILDBEAT_INPUT); fs.writeFileSync(${JSON.stringify(root)} + "/started-" + input.runId, ""); while (fs.existsSync(${JSON.stringify(hang)}) && Date.now() - start < 20000) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20); fs.appendFileSync(${JSON.stringify(timeline)}, JSON.stringify({ run: input.runId, start, end: Date.now() }) + "\\n")'`;
  const config = (work, { parallel } = {}) => {
    const path = join(root, `${work}.yaml`);
    writeFileSync(path, [
      "repo: .", `work: ${work}`, `run: RUN-${work}`, `workflow: ${PRESET}`, "riskPreset: fast", "entry: build",
      ...(parallel === undefined ? [] : [`parallel: ${parallel}`]),
      "stopAt:", "  - review", "workers:",
      "  builder:", `    command: ${process.execPath}`, "    args:", "      - -e", envelope,
      "  verifier:", `    command: ${process.execPath}`, "    args:", "      - -e", verifier,
      "  reviewer:", `    command: ${process.execPath}`, "    args:", "      - -e", envelope,
    ].join("\n"));
    return path;
  };
  const ledger = (run) => join(root, ".buildbeat", "runtime", "runs", run, "events.jsonl");
  return { root, hang, timeline, config, ledger };
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

function startDetached(configPath) {
  const child = spawn(process.execPath, [CLI, "start", "--config", configPath, "--attempt", "new"], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (chunk) => (out += chunk));
  child.stderr.on("data", (chunk) => (out += chunk));
  return { child, done: new Promise((resolve) => child.on("close", (code) => resolve({ code, out }))) };
}

// Waits until the run's verifier process is actually executing (it writes
// started-<run> itself), not merely until the ledger says the step began:
// under load the worker may launch well after STEP_STARTED.
async function untilVerifying(f, run) {
  const deadline = Date.now() + 15000;
  while (!existsSync(join(f.root, `started-${run}`))) {
    assert.ok(Date.now() < deadline, `${run} never reached verify`);
    await pause(50);
  }
}

function startNow(configPath) {
  return spawnSync(process.execPath, [CLI, "start", "--config", configPath, "--attempt", "new"], { encoding: "utf8" });
}

test("runs of two works that both set parallel: true drive at the same time", async (t) => {
  const f = repo(t);
  writeFileSync(f.hang, "");
  const a = startDetached(f.config("WORK-A", { parallel: true }));
  const b = startDetached(f.config("WORK-B", { parallel: true }));
  await untilVerifying(f, "RUN-WORK-A-01");
  await untilVerifying(f, "RUN-WORK-B-01");
  rmSync(f.hang);
  const [ra, rb] = await Promise.all([a.done, b.done]);
  assert.equal(ra.code, 0, ra.out);
  assert.equal(rb.code, 0, rb.out);
  const spans = readFileSync(f.timeline, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const [x, y] = spans;
  assert.ok(x.start < y.end && y.start < x.end, `verify spans do not overlap: ${JSON.stringify(spans)}`);
  for (const run of ["RUN-WORK-A-01", "RUN-WORK-B-01"]) {
    assert.equal(EventLedger.open(f.ledger(run)).state.pendingHuman.transition, "enter-review");
  }
});

test("a second run of the same work is refused while the first drives", async (t) => {
  const f = repo(t);
  const configPath = f.config("WORK-A", { parallel: true });
  writeFileSync(f.hang, "");
  const first = startDetached(configPath);
  await untilVerifying(f, "RUN-WORK-A-01");
  const second = startNow(configPath);
  rmSync(f.hang);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /another run of WORK-A is active \(runs of the same work never drive together\); held by pid \d+/);
  assert.equal((await first.done).code, 0);
});

test("an exclusive run keeps parallel runs out, and a parallel run keeps an exclusive run out", async (t) => {
  const f = repo(t);
  writeFileSync(f.hang, "");
  const exclusive = startDetached(f.config("WORK-X"));
  await untilVerifying(f, "RUN-WORK-X-01");
  const blockedParallel = startNow(f.config("WORK-P", { parallel: true }));
  assert.notEqual(blockedParallel.status, 0);
  assert.match(blockedParallel.stderr, /another run is active in this repository/);
  rmSync(f.hang);
  assert.equal((await exclusive.done).code, 0);

  writeFileSync(f.hang, "");
  const parallel = startDetached(f.config("WORK-P", { parallel: true }));
  await untilVerifying(f, "RUN-WORK-P-01");
  const blockedExclusive = startNow(f.config("WORK-Y"));
  assert.notEqual(blockedExclusive.status, 0);
  assert.match(blockedExclusive.stderr, /another run is active in this repository \(parallel run\(s\) RUN-WORK-P-01, pid \d+/);
  rmSync(f.hang);
  assert.equal((await parallel.done).code, 0);
});

test("without the switch, runs of different works still queue", async (t) => {
  const f = repo(t);
  writeFileSync(f.hang, "");
  const first = startDetached(f.config("WORK-A", { parallel: false }));
  await untilVerifying(f, "RUN-WORK-A-01");
  const second = startNow(f.config("WORK-B"));
  rmSync(f.hang);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /another run is active in this repository/);
  assert.equal((await first.done).code, 0);
});

test("a parallel marker left by a killed driver does not block an exclusive run", (t) => {
  const f = repo(t);
  const gone = spawnSync(process.execPath, ["-e", ""]).pid;
  const marker = join(f.root, ".buildbeat", "runtime", "locks", "@parallel.RUN-GHOST.lock");
  mkdirSync(marker, { recursive: true });
  writeFileSync(join(marker, "owner.json"), JSON.stringify({ pid: gone, host: hostname(), acquiredAt: "2026-01-01T00:00:00.000Z", command: "start" }));
  const result = startNow(f.config("WORK-A"));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /waiting on human: enter-review/);
  assert.equal(existsSync(marker), false);
});

test("doctor states the concurrency mode", (t) => {
  const f = repo(t);
  const doctor = (path) => execFileSync(process.execPath, [CLI, "doctor", "--config", path], { encoding: "utf8" });
  assert.match(doctor(f.config("WORK-A")), /concurrency: exclusive \(default/);
  assert.match(doctor(f.config("WORK-B", { parallel: true })), /concurrency: parallel/);
  const bad = spawnSync(process.execPath, [CLI, "doctor", "--config", f.config("WORK-C", { parallel: "yes" })], { encoding: "utf8" });
  assert.match(bad.stderr, /parallel: must be true or false, got "yes"/);
});
