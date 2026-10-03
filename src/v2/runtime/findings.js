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

// File anchors a summary cites ("src/a.js:12", "README.md"), line numbers
// dropped, sorted and de-duplicated.
const ANCHOR_PATTERN = /(?:[\w.@-]+\/)*[\w@-][\w.@-]*\.[A-Za-z][A-Za-z0-9]{0,5}(?=[:：\s,，、;；.。)）\]】`'"“”‘’>]|$)/g;
const SOURCE_EXTENSION = /\.(?:c|cc|cpp|cs|css|go|h|html|java|js|json|jsx|kt|md|mjs|py|rb|rs|scss|sh|sql|swift|toml|ts|tsx|vue|xml|ya?ml)$/i;

function fileAnchors(summary) {
  const found = (summary.match(ANCHOR_PATTERN) ?? [])
    .filter((path) => path.includes("/") || SOURCE_EXTENSION.test(path));
  return [...new Set(found)].sort().join("|");
}

function issueText(summary) {
  return summary
    .toLowerCase()
    .replace(ANCHOR_PATTERN, "")
    .replace(/[\d\s\p{P}\p{S}]+/gu, "");
}

// Dice coefficient over character bigrams; works the same for Chinese and
// English and needs no tokenizer.
function similarity(left, right) {
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;
  const counts = new Map();
  for (let i = 0; i < left.length - 1; i += 1) {
    const pair = left.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  let shared = 0;
  for (let i = 0; i < right.length - 1; i += 1) {
    const pair = right.slice(i, i + 2);
    const remaining = counts.get(pair) ?? 0;
    if (remaining > 0) {
      shared += 1;
      counts.set(pair, remaining - 1);
    }
  }
  return (2 * shared) / (left.length - 1 + right.length - 1);
}

// Whether two findings describe the same problem, for review convergence
// only: fingerprints stay exact so adjudications keep their meaning.
// Reviewers restate a finding they already reported ("still contains", new
// line numbers, a reworded tail), so equal fingerprints alone never matched
// across 161 replayed review rounds while the same problem came back three
// times. Thresholds from that replay: same anchors and >= 0.5, or >= 0.6
// otherwise, caught every restatement; unrelated pairs peaked at 0.57, and at
// 0.33 when they cited the same files. Severity never splits an issue, and
// the same description at moved line numbers is the same issue at any
// length. Below 16 characters of description bigrams say little
// ("issue two" / "issue three" share most of them), so a short summary
// matches only in those two exact ways.
const MIN_ISSUE_TEXT = 16;

function plainSummary(summary) {
  return summary.toLowerCase().replace(/\s+/g, " ").trim();
}

export function sameIssue(a, b) {
  if (plainSummary(a.summary) === plainSummary(b.summary)) return true;
  const left = issueText(a.summary);
  const right = issueText(b.summary);
  const anchors = fileAnchors(a.summary);
  const sameAnchors = anchors !== "" && anchors === fileAnchors(b.summary);
  if (sameAnchors && left === right) return true;
  if (Math.min(left.length, right.length) < MIN_ISSUE_TEXT) return false;
  const score = similarity(left, right);
  if (sameAnchors && score >= 0.5) return true;
  return score >= 0.6;
}

export function readFindingsAccount(repoRoot, workId) {
  return readFindingsFile(accountPath(repoRoot, workId));
}

export function readFindingsFile(filePath) {
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
