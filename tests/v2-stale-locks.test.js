import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyGc, planGc } from "../src/v2/runtime/gc.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import {
  acquireLock,
  inspectLock,
  listHeldRunLocks,
  reclaimStaleLock,
  releaseLock,
  WorkspaceError,
} from "../src/v2/workspace/workspace-manager.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");
const PRESET = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");

function tempRoot(t) {
  const root = mkdtempSync(join(tmpdir(), "bb-stale-locks-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

const lockPath = (root, id) => join(root, ".buildbeat", "runtime", "locks", `${id}.lock`);
const readOwnerFile = (root, id) => JSON.parse(readFileSync(join(lockPath(root, id), "owner.json"), "utf8"));

function plantLock(root, id, owner) {
  mkdirSync(lockPath(root, id), { recursive: true });
  if (owner) {
    writeFileSync(join(lockPath(root, id), "owner.json"), JSON.stringify(owner));
  }
}

// A pid that existed a moment ago and is gone now.
function deadPid() {
  return spawnSync(process.execPath, ["-e", ""]).pid;
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

const owner = (pid, extra = {}) => ({ pid, host: hostname(), acquiredAt: "2026-01-01T00:00:00.000Z", command: "start", ...extra });

test("a lock records its owner process", (t) => {
  const root = tempRoot(t);
  acquireLock(root, "RUN-A");
  const recorded = readOwnerFile(root, "RUN-A");
  assert.equal(recorded.pid, process.pid);
  assert.equal(recorded.host, hostname());
  assert.ok(Date.parse(recorded.acquiredAt));
  releaseLock(root, "RUN-A");
  assert.equal(existsSync(lockPath(root, "RUN-A")), false);
});

test("a lock whose owner is alive is not reclaimed and names the owner", (t) => {
  const root = tempRoot(t);
  acquireLock(root, "RUN-A");
  assert.throws(
    () => acquireLock(root, "RUN-A"),
    (error) =>
      error instanceof WorkspaceError &&
      /run RUN-A is already locked: held by pid \d+ on .*still running/.test(error.message) &&
      error.message.includes(`pid ${process.pid}`) &&
      error.lock.state === "alive",
  );
  assert.equal(readOwnerFile(root, "RUN-A").pid, process.pid);
});

test("a lock whose owner process is gone is reclaimed", (t) => {
  const root = tempRoot(t);
  const gone = deadPid();
  plantLock(root, "RUN-A", owner(gone));
  assert.equal(inspectLock(lockPath(root, "RUN-A")).state, "dead");
  acquireLock(root, "RUN-A");
  assert.equal(readOwnerFile(root, "RUN-A").pid, process.pid);
  assert.deepEqual(readdirSync(join(root, ".buildbeat", "runtime", "locks")), ["RUN-A.lock"]);
});

test("a lock owned on another host is never reclaimed", (t) => {
  const root = tempRoot(t);
  plantLock(root, "RUN-A", owner(deadPid(), { host: "elsewhere.invalid" }));
  assert.throws(() => acquireLock(root, "RUN-A"), /held by pid \d+ on elsewhere\.invalid.*another host/);
  assert.equal(readOwnerFile(root, "RUN-A").host, "elsewhere.invalid");
});

test("a lock with no owner record is not reclaimed and says where it is", (t) => {
  const root = tempRoot(t);
  plantLock(root, "RUN-A", null);
  assert.throws(
    () => acquireLock(root, "RUN-A"),
    (error) =>
      /no owner record in \.buildbeat\/runtime\/locks\/RUN-A\.lock/.test(error.message) &&
      !error.message.includes(root),
  );
  assert.equal(existsSync(lockPath(root, "RUN-A")), true);
});

test("reclaim leaves a lock alone when it changed hands after inspection", (t) => {
  const root = tempRoot(t);
  const judgedDead = owner(deadPid());
  const newHolder = owner(process.pid, { acquiredAt: "2026-01-02T00:00:00.000Z" });
  plantLock(root, "RUN-A", newHolder);
  assert.equal(reclaimStaleLock(lockPath(root, "RUN-A"), judgedDead), false);
  assert.deepEqual(readOwnerFile(root, "RUN-A"), newHolder);
  assert.deepEqual(readdirSync(join(root, ".buildbeat", "runtime", "locks")), ["RUN-A.lock"]);
});

test("claims stay inside the lock and go with it on release", (t) => {
  const root = tempRoot(t);
  plantLock(root, "RUN-A", owner(deadPid()));
  acquireLock(root, "RUN-A");
  assert.deepEqual(listHeldRunLocks(root), ["RUN-A"]);
  assert.ok(readdirSync(lockPath(root, "RUN-A")).some((entry) => entry.startsWith("claim-")));
  releaseLock(root, "RUN-A");
  assert.deepEqual(readdirSync(join(root, ".buildbeat", "runtime", "locks")), []);
});

test("while a takeover is in progress every other acquirer is kept out", (t) => {
  const root = tempRoot(t);
  const dead = owner(deadPid());
  plantLock(root, "RUN-A", dead);
  // This process wins the takeover but has not written its owner yet.
  assert.equal(reclaimStaleLock(lockPath(root, "RUN-A"), dead), true);
  assert.throws(() => acquireLock(root, "RUN-A"), /whose process is gone; another process is taking it over right now/);
  assert.equal(existsSync(lockPath(root, "RUN-A")), true);
});

test("a reclaimer that died mid-takeover does not wedge the lock", (t) => {
  const root = tempRoot(t);
  const dead = owner(deadPid());
  plantLock(root, "RUN-A", dead);
  const module = new URL("../src/v2/workspace/workspace-manager.js", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    const { reclaimStaleLock } = await import(${JSON.stringify(module)});
    process.stdout.write(String(reclaimStaleLock(${JSON.stringify(lockPath(root, "RUN-A"))}, ${JSON.stringify(dead)})));
  `], { encoding: "utf8" });
  assert.equal(child.stdout, "true", child.stderr);
  acquireLock(root, "RUN-A");
  assert.equal(readOwnerFile(root, "RUN-A").pid, process.pid);
});

test("processes racing for one stale lock produce exactly one holder", async (t) => {
  const root = tempRoot(t);
  plantLock(root, "RUN-A", owner(deadPid()));
  const go = join(root, "go");
  const done = join(root, "done");
  const module = new URL("../src/v2/workspace/workspace-manager.js", import.meta.url).href;
  // Every racer stays alive until all have tried: a winner that exited
  // early would leave a lock a late racer may legitimately reclaim.
  const script = `
    const { existsSync } = await import("node:fs");
    const { acquireLock } = await import(${JSON.stringify(module)});
    const nap = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
    while (!existsSync(${JSON.stringify(go)})) nap();
    try { acquireLock(${JSON.stringify(root)}, "RUN-A"); process.stdout.write("won " + process.pid + "\\n"); }
    catch { process.stdout.write("lost\\n"); }
    while (!existsSync(${JSON.stringify(done)})) nap();
  `;
  const racers = Array.from({ length: 6 }, () => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "ignore"] });
    const racer = { out: "", child };
    racer.closed = new Promise((resolve) => child.on("close", resolve));
    // A racer that dies before reporting must not leave the test waiting.
    racer.reported = new Promise((resolve) => {
      child.stdout.on("data", (chunk) => {
        racer.out += chunk;
        if (racer.out.includes("\n")) resolve();
      });
      racer.closed.then(resolve);
    });
    return racer;
  });
  // If an assertion fails before the racers are released, end them here;
  // this must not depend on the temp directory, whose own cleanup may
  // already have run.
  t.after(async () => {
    for (const racer of racers) {
      if (racer.child.exitCode === null && racer.child.signalCode === null) {
        racer.child.kill("SIGKILL");
      }
    }
    await Promise.all(racers.map((racer) => racer.closed));
  });
  await pause(300);
  writeFileSync(go, "");
  await Promise.all(racers.map((racer) => racer.reported));
  const winners = racers.map((racer) => racer.out.trim()).filter((out) => out.startsWith("won"));
  assert.equal(winners.length, 1, racers.map((racer) => racer.out.trim()).join(" | "));
  assert.equal(readOwnerFile(root, "RUN-A").pid, Number(winners[0].split(" ")[1]));
  writeFileSync(done, "");
  await Promise.all(racers.map((racer) => racer.closed));
});

test("an alive claimer keeps its claim however long it pauses", (t) => {
  const root = tempRoot(t);
  const dead = owner(deadPid());
  plantLock(root, "RUN-A", dead);
  assert.equal(reclaimStaleLock(lockPath(root, "RUN-A"), dead), true);
  const claim = readdirSync(lockPath(root, "RUN-A")).find((entry) => entry.startsWith("claim-"));
  // Age the claim far beyond any timeout: its claimer (this process) is alive.
  const old = new Date(Date.now() - 24 * 3600 * 1000);
  utimesSync(join(lockPath(root, "RUN-A"), claim), old, old);
  assert.equal(reclaimStaleLock(lockPath(root, "RUN-A"), dead), false);
  assert.deepEqual(readdirSync(lockPath(root, "RUN-A")).filter((entry) => entry.startsWith("claim-")), [claim]);
  assert.ok(!readdirSync(lockPath(root, "RUN-A")).some((entry) => entry.startsWith(".claim.")));
});

test("gc reclaims an active-run lock whose owner is gone and keeps a live one", (t) => {
  const root = tempRoot(t);
  plantLock(root, "active-run", owner(deadPid()));
  const rows = planGc(root);
  assert.equal(rows[0].run, "(repository)");
  assert.equal(rows[0].actions[0].kind, "remove-lock");
  const results = applyGc(root, rows);
  assert.equal(results[0].done, true);
  assert.equal(existsSync(lockPath(root, "active-run")), false);

  acquireLock(root, "active-run");
  const live = planGc(root);
  assert.equal(live[0].actions.length, 0);
  assert.match(live[0].keep[0], /active-run lock held by pid \d+ .*still running/);
});

// Kill recovery: a real driver is SIGKILLed while a worker runs, the way a
// host-tool timeout or a reboot ends it. Nothing is deleted by hand.
function killFixture(t) {
  const root = tempRoot(t);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-qm", "baseline");
  const hang = join(root, "hang");
  writeFileSync(hang, "");
  const envelope = '      - \'require("node:fs").writeFileSync(process.env.BUILDBEAT_OUTPUT, JSON.stringify({status: "succeeded", findings: []}))\'';
  const configPath = join(root, "run-config.yaml");
  writeFileSync(configPath, [
    "repo: .", "work: WORK-KILL", "run: RUN-KILL", `workflow: ${PRESET}`,
    "riskPreset: fast", "entry: build", "stopAt:", "  - review", "workers:",
    "  builder:", `    command: ${process.execPath}`, "    args:", "      - -e", envelope,
    "  verifier:", `    command: ${process.execPath}`, "    args:", "      - -e",
    `      - 'if (require("node:fs").existsSync(${JSON.stringify(hang)})) setTimeout(() => {}, 30000)'`,
    "  reviewer:", `    command: ${process.execPath}`, "    args:", "      - -e", envelope,
  ].join("\n"));
  const ledgerPath = join(root, ".buildbeat", "runtime", "runs", "RUN-KILL-01", "events.jsonl");
  return { root, hang, configPath, ledgerPath };
}

async function startAndKill(f) {
  const driver = spawn(process.execPath, [CLI, "start", "--config", f.configPath, "--attempt", "new"], {
    detached: true,
    stdio: "ignore",
  });
  const deadline = Date.now() + 15000;
  const verifyStarted = () =>
    existsSync(f.ledgerPath) &&
    EventLedger.open(f.ledgerPath).events.some((event) => event.type === "STEP_STARTED" && event.data.step === "verify");
  while (!verifyStarted()) {
    assert.ok(Date.now() < deadline, "driver never reached verify");
    await pause(100);
  }
  process.kill(-driver.pid, "SIGKILL");
  while (true) {
    try {
      process.kill(driver.pid, 0);
    } catch {
      break;
    }
    await pause(50);
  }
  rmSync(f.hang);
  assert.equal(existsSync(lockPath(f.root, "active-run")), true);
  assert.equal(existsSync(lockPath(f.root, "RUN-KILL-01")), true);
}

test("after the driver is SIGKILLed mid-step, resume recovers without touching any file", async (t) => {
  const f = killFixture(t);
  await startAndKill(f);
  const resumed = spawnSync(process.execPath, [CLI, "resume", "--config", f.configPath], { encoding: "utf8" });
  assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
  assert.match(resumed.stderr, /reclaimed stale lock active-run \(owner pid \d+ on .* is gone\)/);
  assert.match(resumed.stdout, /waiting on human: enter-review/);
  const ledger = EventLedger.open(f.ledgerPath);
  assert.ok(ledger.events.some((event) => event.type === "RUN_INTERRUPTED"));
  assert.equal(ledger.state.steps.verify.attempts, 2);
  assert.equal(existsSync(lockPath(f.root, "active-run")), false);
  assert.equal(existsSync(lockPath(f.root, "RUN-KILL-01")), false);
});

test("after the driver is SIGKILLed, stop cancels the run and the next start is not blocked", async (t) => {
  const f = killFixture(t);
  await startAndKill(f);
  const stopped = spawnSync(process.execPath, [CLI, "stop", "--repo", f.root, "--run", "RUN-KILL-01", "--reason", "driver killed"], { encoding: "utf8" });
  assert.equal(stopped.status, 0, stopped.stdout + stopped.stderr);
  assert.equal(EventLedger.open(f.ledgerPath).state.terminal.status, "CANCELLED");
  const next = spawnSync(process.execPath, [CLI, "start", "--config", f.configPath, "--attempt", "new"], { encoding: "utf8" });
  assert.equal(next.status, 0, next.stdout + next.stderr);
  assert.match(next.stdout, /attempt: RUN-KILL-02/);
  assert.match(next.stdout, /waiting on human: enter-review/);
});
