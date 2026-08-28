// Evidence Collector v0 per docs/v2/RFC-0002-domain-model.md §4: evidence is
// what the runner read back (exit codes, logs, git state), never what a
// worker said. Raw logs stay in the runtime plane; the returned record is the
// contract-shaped fact the ledger and manifests reference.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function collectCommandEvidence({
  runtimeDir,
  runId,
  step,
  attempt,
  execResult,
  subject,
  kind = "command",
  grade = "L2",
  coverage = null,
}) {
  const logsDir = join(runtimeDir, "runs", runId, "logs");
  mkdirSync(logsDir, { recursive: true });
  const logName = `${step}-${attempt}.log`;
  const logPath = join(logsDir, logName);
  const logBody = [
    `command: ${execResult.command}`,
    `exitCode: ${execResult.exitCode}`,
    `signal: ${execResult.signal}`,
    `timedOut: ${execResult.timedOut}`,
    `spawnError: ${execResult.spawnError}`,
    "--- stdout ---",
    execResult.stdout,
    "--- stderr ---",
    execResult.stderr,
  ].join("\n");
  writeFileSync(logPath, logBody, "utf8");
  const digest = `sha256:${createHash("sha256").update(logBody, "utf8").digest("hex")}`;

  let status;
  if (execResult.spawnError) {
    status = "unverified";
  } else if (execResult.exitCode === 0 && !execResult.timedOut && !execResult.signal) {
    status = "passed";
  } else {
    status = "failed";
  }

  return {
    kind,
    subject,
    producer: "runner",
    command: execResult.command,
    exitCode: execResult.exitCode,
    startedAt: execResult.startedAt,
    finishedAt: execResult.finishedAt,
    digest,
    location: logPath,
    coverage,
    status,
    adapter: execResult.adapter,
    grade,
  };
}
