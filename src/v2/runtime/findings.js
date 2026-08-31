// Review findings account per Work (Git plane, invariant 23: runtime stays
// deletable). Every reviewer finding lands as a row keyed by a fingerprint;
// human adjudications (accept/dismiss) append rows bound to that fingerprint.
// A dismissed fingerprint no longer blocks and later reviewers receive the
// adjudicated history as an anchor — re-litigating a settled verdict takes a
// human decision, not a louder fresh reviewer. (Absorbed from the 30-run
// deploy campaign: memoryless fresh reviewers oscillated between mutually
// exclusive prescriptions and re-litigated accepted designs.)

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ADJUDICATION_ACTIONS = ["accept", "dismiss"];

export class FindingsError extends Error {
  constructor(message) {
    super(message);
    this.name = "FindingsError";
  }
}

export function findingsAccountRef(workId) {
  return `delivery/work/${workId}/review-findings.jsonl`;
}

function accountPath(repoRoot, workId) {
  return join(repoRoot, "delivery", "work", workId, "review-findings.jsonl");
}

// Same-text findings from different fresh reviewers must collide; severity is
// part of the identity so an escalation (P2 -> P0) reopens on its own.
export function fingerprintFinding(finding) {
  const normalized = `${finding.severity}|${finding.summary}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 16);
}

export function readFindingsAccount(repoRoot, workId) {
  const filePath = accountPath(repoRoot, workId);
  if (!existsSync(filePath)) {
    return [];
  }
  const rows = [];
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    if (line.length === 0) {
      continue;
    }
    try {
      rows.push(JSON.parse(line));
    } catch {
      throw new FindingsError(`findings account has an invalid line: ${filePath}`);
    }
  }
  return rows;
}

function appendRow(repoRoot, workId, row) {
  const dir = join(repoRoot, "delivery", "work", workId);
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "review-findings.jsonl"), `${JSON.stringify(row)}\n`, "utf8");
}

// Latest adjudication wins per fingerprint.
export function latestAdjudications(rows) {
  const map = new Map();
  for (const row of rows) {
    if (row.kind === "adjudication") {
      map.set(row.fingerprint, row);
    }
  }
  return map;
}

// Records one review attempt's findings into the account. Fingerprints that
// already have a finding row are not duplicated; a finding whose fingerprint
// a human dismissed is recorded as a re-raise attempt so the oscillation is
// visible in the account, not just absent from the routing.
export function recordReviewFindings(repoRoot, workId, { run, step, attempt, findings, ts }) {
  const rows = readFindingsAccount(repoRoot, workId);
  const adjudicated = latestAdjudications(rows);
  const known = new Set(rows.filter((row) => row.kind === "finding").map((row) => row.fingerprint));
  const recorded = [];
  for (const [index, finding] of findings.entries()) {
    const fingerprint = fingerprintFinding(finding);
    const dismissed = adjudicated.get(fingerprint)?.action === "dismiss";
    if (known.has(fingerprint) && !dismissed) {
      continue;
    }
    const row = {
      ts,
      kind: "finding",
      run,
      step,
      attempt,
      id: `F-${run}-${step}-${attempt}-${index + 1}`,
      severity: finding.severity,
      summary: finding.summary,
      fingerprint,
      ...(dismissed ? { reRaised: true } : {}),
    };
    appendRow(repoRoot, workId, row);
    known.add(fingerprint);
    recorded.push(row);
  }
  return recorded;
}

export function adjudicateFinding(repoRoot, workId, { fingerprint, action, by, note, ts }) {
  if (!ADJUDICATION_ACTIONS.includes(action)) {
    throw new FindingsError(`action must be one of ${ADJUDICATION_ACTIONS.join("|")}, got: ${action}`);
  }
  const rows = readFindingsAccount(repoRoot, workId);
  const finding = rows.find((row) => row.kind === "finding" && row.fingerprint === fingerprint);
  if (!finding) {
    throw new FindingsError(
      `no recorded finding with fingerprint ${fingerprint}; adjudications bind to recorded findings only`,
    );
  }
  const row = {
    ts: ts ?? new Date().toISOString(),
    kind: "adjudication",
    fingerprint,
    action,
    by: by ?? "human",
    ...(note ? { note } : {}),
  };
  appendRow(repoRoot, workId, row);
  return { ...row, summary: finding.summary, severity: finding.severity };
}

// Compact anchor for worker input (BUILDBEAT_INPUT): the full adjudicated
// history plus open findings, capped so the env payload stays small.
const ANCHOR_CAP = 50;
const SUMMARY_CAP = 300;

export function buildAnchor(repoRoot, workId) {
  const rows = readFindingsAccount(repoRoot, workId);
  if (rows.length === 0) {
    return null;
  }
  const adjudicated = latestAdjudications(rows);
  const entries = rows
    .filter((row) => row.kind === "finding")
    .map((row) => ({
      fingerprint: row.fingerprint,
      severity: row.severity,
      summary:
        row.summary.length > SUMMARY_CAP ? `${row.summary.slice(0, SUMMARY_CAP)}…` : row.summary,
      adjudication: adjudicated.get(row.fingerprint)?.action ?? "open",
    }));
  return {
    account: findingsAccountRef(workId),
    findings: entries.slice(-ANCHOR_CAP),
  };
}
