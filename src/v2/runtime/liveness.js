// Liveness and timing, derived only from the ledger and the live output
// streams the shell adapter leaves in the run directory. Nothing here is
// written to the ledger: "how long has this been running" and "when did the
// worker last print something" are readings, not facts a Run must carry.
//
// Real incident (deploy campaign, 2026-08-30): the owner asked "半小时了，
// 正常吗 / 十分钟了，是卡住了吗" more than ten times because status showed
// steps and attempts and nothing about time. This module is that answer.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { EventLedger } from "../storage/event-ledger.js";
import { LIVE_MARKER } from "../adapters/shell.js";

export const DEFAULT_STALL_AFTER_MS = 15 * 60 * 1000;

export function runDir(repoRoot, runId) {
  return join(repoRoot, ".buildbeat", "runtime", "runs", runId);
}

// Every step attempt as a timed row; the in-flight one (if any) has no end.
export function stepTimeline(events) {
  const open = new Map();
  const rows = [];
  let running = null;
  for (const event of events) {
    if (event.type === "STEP_STARTED") {
      const key = `${event.data.step}#${event.data.attempt}`;
      open.set(key, { step: event.data.step, attempt: event.data.attempt, worker: event.data.worker, startedAt: event.ts });
      running = open.get(key);
    } else if (event.type === "STEP_FINISHED") {
      const key = `${event.data.step}#${event.data.attempt}`;
      const started = open.get(key);
      const startedAt = started?.startedAt ?? null;
      rows.push({
        step: event.data.step,
        attempt: event.data.attempt,
        worker: started?.worker ?? null,
        startedAt,
        finishedAt: event.ts,
        status: event.data.status,
        durationMs: startedAt ? Date.parse(event.ts) - Date.parse(startedAt) : null,
      });
      open.delete(key);
      if (running && running.step === event.data.step && running.attempt === event.data.attempt) {
        running = null;
      }
    }
  }
  return { rows, running };
}

function median(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// Typical (median) duration per step across every readable ledger in the
// repository, optionally excluding the run being described. Crashed and
// timed-out attempts are excluded: they measure the host, not the step.
export function typicalDurations(repoRoot, { excludeRun = null } = {}) {
  const runsDir = join(repoRoot, ".buildbeat", "runtime", "runs");
  const samples = {};
  if (!existsSync(runsDir)) {
    return {};
  }
  for (const entry of readdirSync(runsDir)) {
    if (entry === excludeRun) {
      continue;
    }
    const ledgerPath = join(runsDir, entry, "events.jsonl");
    if (!existsSync(ledgerPath)) {
      continue;
    }
    const ledger = EventLedger.open(ledgerPath);
    for (const row of stepTimeline(ledger.events).rows) {
      if (row.durationMs === null || row.status === "crashed" || row.status === "timeout") {
        continue;
      }
      (samples[row.step] ??= []).push(row.durationMs);
    }
  }
  const result = {};
  for (const [step, values] of Object.entries(samples)) {
    result[step] = { medianMs: median(values), samples: values.length };
  }
  return result;
}

// Reads the shell adapter's live marker and the mtime/size of its streams.
export function readLive(repoRoot, runId) {
  const dir = runDir(repoRoot, runId);
  const markerPath = join(dir, LIVE_MARKER);
  if (!existsSync(markerPath)) {
    return null;
  }
  let marker;
  try {
    marker = JSON.parse(readFileSync(markerPath, "utf8"));
  } catch {
    return null;
  }
  let lastOutputAt = null;
  let bytes = 0;
  for (const path of [marker.stdout, marker.stderr]) {
    if (!path || !existsSync(path)) {
      continue;
    }
    const stat = statSync(path);
    bytes += stat.size;
    if (stat.size > 0 && (lastOutputAt === null || stat.mtimeMs > lastOutputAt)) {
      lastOutputAt = stat.mtimeMs;
    }
  }
  return { ...marker, lastOutputAt: lastOutputAt === null ? null : new Date(lastOutputAt).toISOString(), bytes };
}

export function tailLive(repoRoot, runId, lines = 5) {
  const live = readLive(repoRoot, runId);
  if (!live) {
    return [];
  }
  const out = [];
  for (const path of [live.stdout, live.stderr]) {
    if (!path || !existsSync(path)) {
      continue;
    }
    const text = readFileSync(path, "utf8");
    out.push(...text.split("\n").filter((line) => line.trim().length > 0));
  }
  return out.slice(-lines);
}

export function describeLiveness({ repoRoot, runId, ledger, stallAfterMs = DEFAULT_STALL_AFTER_MS, now = Date.now }) {
  const { rows, running } = stepTimeline(ledger.events);
  const typical = typicalDurations(repoRoot, { excludeRun: runId });
  const steps = {};
  for (const row of rows) {
    const entry = (steps[row.step] ??= { attempts: 0, totalMs: 0, lastMs: null, typicalMs: typical[row.step]?.medianMs ?? null, samples: typical[row.step]?.samples ?? 0 });
    entry.attempts += 1;
    if (row.durationMs !== null) {
      entry.totalMs += row.durationMs;
      entry.lastMs = row.durationMs;
    }
  }
  let inFlight = null;
  if (running && ledger.state.run?.status === "RUNNING") {
    const nowMs = now();
    const live = readLive(repoRoot, runId);
    const elapsedMs = nowMs - Date.parse(running.startedAt);
    const lastOutputMs = live?.lastOutputAt ? Date.parse(live.lastOutputAt) : null;
    const sinceOutputMs = lastOutputMs === null ? elapsedMs : nowMs - lastOutputMs;
    inFlight = {
      step: running.step,
      attempt: running.attempt,
      worker: running.worker,
      startedAt: running.startedAt,
      elapsedMs,
      command: live?.command ?? null,
      lastOutputAt: live?.lastOutputAt ?? null,
      sinceOutputMs,
      bytes: live?.bytes ?? 0,
      stalled: sinceOutputMs >= stallAfterMs,
      stallAfterMs,
      typicalMs: typical[running.step]?.medianMs ?? null,
      samples: typical[running.step]?.samples ?? 0,
    };
    steps[running.step] ??= { attempts: 0, totalMs: 0, lastMs: null, typicalMs: inFlight.typicalMs, samples: inFlight.samples };
  }
  return { steps, inFlight };
}

export function formatMs(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) {
    return "?";
  }
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) {
    return `${total}s`;
  }
  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}m`;
}
