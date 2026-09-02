import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createShellAdapter, liveStreamPaths } from "../src/v2/adapters/shell.js";
import {
  describeLiveness,
  formatMs,
  stepTimeline,
  typicalDurations,
} from "../src/v2/runtime/liveness.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat-v2.js");
const KERNEL = { kind: "kernel", id: "test" };
const BASE = "0123456789abcdef0123456789abcdef01234567";

function cli(args) {
  return execFileSync("node", [CLI, ...args], { encoding: "utf8" });
}

function iso(offsetMs, origin = Date.parse("2026-09-02T10:00:00.000Z")) {
  return new Date(origin + offsetMs).toISOString();
}

// A RUNNING ledger with one finished build attempt and a verify attempt in
// flight, written with explicit timestamps so durations are exact.
function runningLedger(root, runId, { workId = "WORK-L", origin } = {}) {
  const path = join(root, ".buildbeat", "runtime", "runs", runId, "events.jsonl");
  const ledger = EventLedger.open(path);
  const at = (ms) => iso(ms, origin);
  ledger.append({
    type: "RUN_CREATED",
    actor: KERNEL,
    ts: at(0),
    run: runId,
    work: workId,
    data: { workflowRef: "software-delivery", workflowDigest: "sha256:x", base: BASE, riskPreset: "fast", entry: "build" },
  });
  ledger.append({ type: "RUN_STARTED", actor: KERNEL, ts: at(0), data: {} });
  ledger.append({
    type: "WORKSPACE_BOUND",
    actor: KERNEL,
    ts: at(0),
    data: { workspaceId: runId, repo: ".", branch: `run/${runId}`, worktreePath: `.buildbeat/worktrees/${runId}`, base: BASE },
  });
  ledger.append({
    type: "STEP_STARTED",
    actor: KERNEL,
    ts: at(60_000),
    data: { step: "build", attempt: 1, worker: "builder", adapter: "shell:builder", workspaceId: runId },
  });
  ledger.append({
    type: "STEP_FINISHED",
    actor: KERNEL,
    ts: at(360_000),
    data: { step: "build", attempt: 1, status: "succeeded" },
  });
  ledger.append({
    type: "STEP_STARTED",
    actor: KERNEL,
    ts: at(400_000),
    data: { step: "verify", attempt: 1, worker: "verifier", adapter: "shell:verifier", workspaceId: runId },
  });
  return { ledger, path, at };
}

test("shell adapter streams worker output to live files while the step runs, then folds them into the result", () => {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-live-"));
  const liveDir = join(root, "runs", "RUN-LIVE");
  const adapter = createShellAdapter({
    name: "shell:builder",
    command: "bash",
    args: [
      "-lc",
      // The worker itself proves the marker and streams exist mid-run.
      'echo "out-line-1"; echo "err-line-1" >&2; cat "$LIVEDIR/live.json"; ls "$LIVEDIR"',
    ],
    env: { LIVEDIR: liveDir },
  });
  const result = adapter.execute({
    step: "build",
    worker: "builder",
    workspacePath: root,
    input: { runId: "RUN-LIVE", step: "build", attempt: 2 },
    liveDir,
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /out-line-1/);
  assert.match(result.stdout, /"step":"build","attempt":2,"worker":"builder"/);
  assert.match(result.stdout, /build-2\.stdout\.live/);
  assert.match(result.stdout, /build-2\.stderr\.live/);
  assert.match(result.stderr, /err-line-1/);
  // Nothing live is left behind once the step returns.
  const paths = liveStreamPaths(liveDir, "build", 2);
  assert.equal(existsSync(paths.marker), false);
  assert.equal(existsSync(paths.stdout), false);
  assert.equal(existsSync(paths.stderr), false);
  assert.deepEqual(readdirSync(liveDir), []);
});

test("shell adapter without liveDir keeps the buffered behaviour", () => {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-live-"));
  const adapter = createShellAdapter({ command: "bash", args: ["-lc", "echo plain; echo warn >&2; exit 3"] });
  const result = adapter.execute({ step: "build", worker: "builder", workspacePath: root, input: {} });
  assert.equal(result.exitCode, 3);
  assert.equal(result.stdout.trim(), "plain");
  assert.equal(result.stderr.trim(), "warn");
});

test("timeline, typical durations and stall detection derive from the ledger and live files only", () => {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-live-"));
  const origin = Date.parse("2026-09-02T10:00:00.000Z");
  // An older run gives build a history: 5 min and 7 min → median 6 min.
  const older = runningLedger(root, "RUN-OLD", { origin: origin - 86_400_000 });
  older.ledger.append({ type: "STEP_FINISHED", actor: KERNEL, ts: older.at(430_000), data: { step: "verify", attempt: 1, status: "failed" } });
  older.ledger.append({ type: "STEP_STARTED", actor: KERNEL, ts: older.at(440_000), data: { step: "build", attempt: 2, worker: "builder", adapter: "shell:builder", workspaceId: "RUN-OLD" } });
  older.ledger.append({ type: "STEP_FINISHED", actor: KERNEL, ts: older.at(860_000), data: { step: "build", attempt: 2, status: "succeeded" } });
  // A crashed attempt must not pollute the typical duration.
  older.ledger.append({ type: "STEP_STARTED", actor: KERNEL, ts: older.at(900_000), data: { step: "verify", attempt: 2, worker: "verifier", adapter: "shell:verifier", workspaceId: "RUN-OLD" } });
  older.ledger.append({ type: "STEP_FINISHED", actor: KERNEL, ts: older.at(9_000_000), data: { step: "verify", attempt: 2, status: "crashed" } });

  const { ledger } = runningLedger(root, "RUN-NOW", { origin });
  const timeline = stepTimeline(ledger.events);
  assert.equal(timeline.rows.length, 1);
  assert.equal(timeline.rows[0].durationMs, 300_000);
  assert.equal(timeline.running.step, "verify");

  const typical = typicalDurations(root, { excludeRun: "RUN-NOW" });
  assert.equal(typical.build.medianMs, 360_000);
  assert.equal(typical.build.samples, 2);
  assert.equal(typical.verify.samples, 1);
  assert.equal(typical.verify.medianMs, 30_000);

  // Live marker + a stream last touched 20 minutes ago: stalled at the
  // default 15-minute threshold, not stalled at 30.
  const runDir = join(root, ".buildbeat", "runtime", "runs", "RUN-NOW");
  mkdirSync(runDir, { recursive: true });
  const paths = liveStreamPaths(runDir, "verify", 1);
  writeFileSync(paths.stdout, "verifying...\nstill going\n");
  writeFileSync(paths.stderr, "");
  const now = origin + 400_000 + 25 * 60_000;
  const lastOutput = new Date(now - 20 * 60_000);
  utimesSync(paths.stdout, lastOutput, lastOutput);
  writeFileSync(
    paths.marker,
    JSON.stringify({ step: "verify", attempt: 1, worker: "verifier", command: "bash -lc npm test", startedAt: iso(400_000, origin), stdout: paths.stdout, stderr: paths.stderr }),
  );

  const view = describeLiveness({ repoRoot: root, runId: "RUN-NOW", ledger, now: () => now });
  assert.equal(view.steps.build.lastMs, 300_000);
  assert.equal(view.steps.build.typicalMs, 360_000);
  assert.equal(view.inFlight.step, "verify");
  assert.equal(view.inFlight.elapsedMs, 25 * 60_000);
  assert.equal(view.inFlight.command, "bash -lc npm test");
  assert.equal(view.inFlight.stalled, true);
  assert.ok(view.inFlight.sinceOutputMs >= 20 * 60_000 - 1000);
  const relaxed = describeLiveness({ repoRoot: root, runId: "RUN-NOW", ledger, now: () => now, stallAfterMs: 30 * 60_000 });
  assert.equal(relaxed.inFlight.stalled, false);

  // CLI status renders the same facts; the raw absolute path never leaks.
  const statusOut = cli(["status", "--repo", root, "--run", "RUN-NOW"]);
  assert.match(statusOut, /step build: SUCCEEDED \(attempts 1\) \[last 5m, typical 6m n=2\]/);
  assert.match(statusOut, /in flight: verify attempt 1 since 2026-09-02T10:06:40\.000Z \(elapsed .*typical 30s n=1\)/);
  assert.match(statusOut, /worker: bash -lc npm test/);
  assert.match(statusOut, /STALLED: no output for/);
  assert.match(statusOut, /\| still going/);
  assert.doesNotMatch(statusOut, new RegExp(root));
  const relaxedOut = cli(["status", "--repo", root, "--run", "RUN-NOW", "--stall-after", "600"]);
  assert.doesNotMatch(relaxedOut, /STALLED/);

  // watch --once reports the stall exactly once per attempt and exits.
  const watchOut = cli(["watch", "--repo", root, "--run", "RUN-NOW", "--once", "true"]);
  assert.match(watchOut, /watch: STALLED verify attempt 1/);

  // metrics carries the typical durations over every run (RUN-NOW's own
  // 5-minute build included: 5, 5, 7 → 5m).
  const metricsOut = cli(["metrics", "--repo", root]);
  assert.match(metricsOut, /typical step duration \(median\): build=5m \(n=3\) verify=30s \(n=1\)/);
});

test("formatMs renders human durations", () => {
  assert.equal(formatMs(0), "0s");
  assert.equal(formatMs(59_000), "59s");
  assert.equal(formatMs(61_000), "1m");
  assert.equal(formatMs(3_600_000), "1h");
  assert.equal(formatMs(3_900_000), "1h05m");
  assert.equal(formatMs(null), "?");
});
