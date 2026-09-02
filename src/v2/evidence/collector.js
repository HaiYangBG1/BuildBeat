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
  redact = [],
}) {
  const logsDir = join(runtimeDir, "runs", runId, "logs");
  mkdirSync(logsDir, { recursive: true });
  const logName = `${step}-${attempt}.log`;
  const logPath = join(logsDir, logName);
  // Redaction (iteration 08, C6): patterns from the run config are applied
  // to worker output before it becomes evidence. The digest binds the
  // redacted text — what is on disk is what was hashed.
  const scrub = (text) => {
    let out = String(text ?? "");
    for (const pattern of redact) {
      out = out.replace(pattern, "<REDACTED>");
    }
    return out;
  };
  const logBody = [
    `command: ${scrub(execResult.command)}`,
    `exitCode: ${execResult.exitCode}`,
    `signal: ${execResult.signal}`,
    `timedOut: ${execResult.timedOut}`,
    `spawnError: ${execResult.spawnError}`,
    "--- stdout ---",
    scrub(execResult.stdout),
    "--- stderr ---",
    scrub(execResult.stderr),
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
