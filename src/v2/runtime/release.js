// Release readback and closeout (4.0; replaces the retired release-readback
// lane, owner decision 2026-10-04). BuildBeat still performs no deployment
// (invariant 20): after a person releases a merged candidate, the project's
// own read-only command proves the release took effect. Every readback is a
// line in the Work's releases.jsonl, next to its decisions, and the window
// closes only on a passing readback. Real cost behind it: one pilot go-live
// was recorded by hand as forty "step N readback" commits.

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { createShellAdapter } from "../adapters/shell.js";
import { toRepoRef } from "./repo-ref.js";

const TAIL_LINES = 20;

export class ReleaseError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleaseError";
  }
}

function workDir(repoRoot, workId) {
  return join(repoRoot, "delivery", "work", workId);
}

function readRows(path) {
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function readReleases(repoRoot, workId) {
  return readRows(join(workDir(repoRoot, workId), "releases.jsonl"));
}

function isAncestor(repoRoot, sha, commit) {
  try {
    execFileSync(
      "git",
      ["-C", repoRoot, "merge-base", "--is-ancestor", sha, commit],
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

// Runs the configured readback in the main checkout once and records it.
// `runs` are the Work's runs (overview's runsFor); the newest SUCCEEDED one
// whose candidate the release ref contains is what this readback is about.
export function runReadback({
  repoRoot,
  workId,
  spec,
  redact = [],
  runs,
  ref = "HEAD",
  note = null,
  ts = new Date().toISOString(),
}) {
  const resolveCommit = (name) =>
    execFileSync(
      "git",
      ["-C", repoRoot, "rev-parse", "--verify", `${name}^{commit}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  let commit;
  try {
    commit = resolveCommit(ref);
  } catch {
    throw new ReleaseError(`--ref ${ref} does not name a commit`);
  }
  // The command runs in the main checkout, which may sit elsewhere than the
  // released ref; both are recorded so neither is claimed for the other.
  const checkout = resolveCommit("HEAD");
  const succeeded = runs
    .filter((run) => run.status === "SUCCEEDED" && run.candidate)
    .sort((a, b) => String(a.lastAt).localeCompare(String(b.lastAt)));
  if (succeeded.length === 0) {
    throw new ReleaseError(
      `${workId} has no succeeded run; approve its merge decision first`,
    );
  }
  const released = [...succeeded]
    .reverse()
    .find((run) => isAncestor(repoRoot, run.candidate, commit));
  if (!released) {
    const latest = succeeded.at(-1);
    throw new ReleaseError(
      `candidate ${latest.candidate.slice(0, 7)} (${latest.id}) is not contained in ${ref} (${commit.slice(0, 7)}); merge it first`,
    );
  }

  const adapter = createShellAdapter({
    name: "shell:release",
    command: spec.command,
    args: spec.args ?? [],
    timeoutMs: spec.timeoutMs,
    inheritEnv: spec.inheritEnv === true,
    env: spec.env ?? {},
  });
  const exec = adapter.execute({
    step: "release",
    worker: "release",
    workspacePath: repoRoot,
    input: { workId, run: released.id, candidate: released.candidate, ref, commit },
  });
  const scrub = (text) => {
    let out = String(text ?? "");
    for (const pattern of redact) {
      out = out.replace(pattern, "<REDACTED>");
    }
    return out;
  };
  const output = [scrub(exec.stdout), scrub(exec.stderr)]
    .filter((text) => text.length > 0)
    .join("\n");
  const body = [
    `command: ${scrub(exec.command)}`,
    `exitCode: ${exec.exitCode}`,
    `signal: ${exec.signal}`,
    `timedOut: ${exec.timedOut}`,
    `spawnError: ${exec.spawnError}`,
    "--- stdout ---",
    scrub(exec.stdout),
    "--- stderr ---",
    scrub(exec.stderr),
  ].join("\n");
  const logDir = join(repoRoot, ".buildbeat", "runtime", "releases", workId);
  mkdirSync(logDir, { recursive: true });
  // Unique per readback: concurrent readbacks never share a log file.
  const logPath = join(
    logDir,
    `release-${ts.replace(/[^0-9A-Za-z]/g, "")}-${randomUUID().slice(0, 8)}.log`,
  );
  writeFileSync(logPath, body, { encoding: "utf8", flag: "wx" });
  const passed =
    exec.exitCode === 0 && !exec.timedOut && !exec.signal && !exec.spawnError;
  const row = {
    ts,
    work: workId,
    run: released.id,
    candidate: released.candidate,
    ref,
    commit,
    checkout,
    ...(note ? { note } : {}),
    command: scrub(exec.command),
    exitCode: exec.exitCode,
    status: passed ? "passed" : "failed",
    grade: "L4",
    digest: `sha256:${createHash("sha256").update(body, "utf8").digest("hex")}`,
    log: toRepoRef(repoRoot, logPath),
    tail: output.split("\n").filter(Boolean).slice(-TAIL_LINES),
  };
  mkdirSync(workDir(repoRoot, workId), { recursive: true });
  appendFileSync(
    join(workDir(repoRoot, workId), "releases.jsonl"),
    `${JSON.stringify(row)}\n`,
    "utf8",
  );
  return row;
}

// Closes the release window: a close-work decision bound to the latest
// readback, which must have passed.
export function closeWork({
  repoRoot,
  workId,
  result,
  by = "human",
  ts = new Date().toISOString(),
}) {
  if (typeof result !== "string" || result.trim() === "") {
    throw new ReleaseError("closing a work needs --result <text>");
  }
  const decisionsPath = join(workDir(repoRoot, workId), "decisions.jsonl");
  const decisions = readRows(decisionsPath);
  if (decisions.some((row) => row.transition === "close-work")) {
    throw new ReleaseError(`${workId} is already closed`);
  }
  const latest = readReleases(repoRoot, workId).at(-1);
  if (!latest) {
    throw new ReleaseError(
      `${workId} has no readback; run buildbeat release --config <run-config.yaml> after the release first`,
    );
  }
  if (latest.status !== "passed") {
    throw new ReleaseError(
      `the latest readback failed (exit ${latest.exitCode} at ${latest.ts}); fix the release and run buildbeat release again before closing`,
    );
  }
  const count = existsSync(decisionsPath)
    ? readFileSync(decisionsPath, "utf8").split("\n").filter(Boolean).length
    : 0;
  const row = {
    ts,
    decisionRef: `C-${workId}-${count + 1}`,
    decision: "closed",
    transition: "close-work",
    subject: {
      result: result.trim(),
      readback: latest.digest,
      commit: latest.commit,
      candidate: latest.candidate,
    },
    by,
  };
  appendFileSync(decisionsPath, `${JSON.stringify(row)}\n`, "utf8");
  return row;
}
