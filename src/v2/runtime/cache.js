// Verification reuse and incremental review (iteration 08, C7).
//
// Reuse: a verify step whose input is byte-identical to one that already
// passed — same tree, same worker command, same envelope — is not re-run; the
// earlier evidence is referenced and the reuse is visible in the ledger
// (`reused`) and in status. Only *passed* results are ever reused; a failure
// always runs again. Real number: the deploy campaign's envelope-side cache
// cut verify from 25 to 13 minutes per round.
//
// Incremental review: a reviewer is told which candidate the last review
// looked at (when it is an ancestor of the current one) so it can focus on
// the delta instead of re-reading the whole change every round.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { EventLedger } from "../storage/event-ledger.js";
import { canonicalJson } from "../storage/event-ledger.js";

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

export function treeHash(worktreePath) {
  return git(worktreePath, ["rev-parse", "HEAD^{tree}"]);
}

export function cacheKey({ tree, worker, adapterSpec, adapterName, envelopeDigest }) {
  const body = canonicalJson({
    tree,
    worker,
    adapter: adapterSpec ?? adapterName ?? null,
    envelope: envelopeDigest ?? null,
  });
  return `sha256:${createHash("sha256").update(body, "utf8").digest("hex")}`;
}

function eachLedger(repoRoot, { excludeRun = null } = {}) {
  const runsDir = join(repoRoot, ".buildbeat", "runtime", "runs");
  const out = [];
  if (!existsSync(runsDir)) {
    return out;
  }
  for (const entry of readdirSync(runsDir).sort()) {
    if (entry === excludeRun) {
      continue;
    }
    const path = join(runsDir, entry, "events.jsonl");
    if (!existsSync(path)) {
      continue;
    }
    const ledger = EventLedger.open(path);
    if (ledger.state.run) {
      out.push(ledger);
    }
  }
  return out;
}

// Latest passed command evidence carrying this cache key, across the
// repository's runs (the current run included: a re-verify after an
// unrelated fix step on the same tree is the common case).
export function findReusableEvidence(repoRoot, key) {
  let best = null;
  for (const ledger of eachLedger(repoRoot)) {
    for (const event of ledger.events) {
      if (
        event.type === "EVIDENCE_RECORDED" &&
        event.data.cacheKey === key &&
        event.data.status === "passed" &&
        event.data.kind === "command" &&
        !event.data.reused
      ) {
        if (!best || event.ts > best.ts) {
          best = { run: ledger.state.run.id, evidenceRef: event.data.evidenceRef, digest: event.data.digest, grade: event.data.grade, ts: event.ts };
        }
      }
    }
  }
  return best;
}

// The most recent review evidence for this work whose subject is an ancestor
// of (and not equal to) the current head — the anchor for an incremental
// review. Null when there is no such review.
export function lastReviewedCandidate(repoRoot, workId, worktreePath, head) {
  let best = null;
  for (const ledger of eachLedger(repoRoot)) {
    if (ledger.state.run.work !== workId) {
      continue;
    }
    for (const event of ledger.events) {
      if (event.type !== "EVIDENCE_RECORDED" || event.data.kind !== "review") {
        continue;
      }
      const subject = event.data.subject;
      if (!subject || subject === head) {
        continue;
      }
      if (best && event.ts <= best.ts) {
        continue;
      }
      let ancestor = false;
      try {
        execFileSync("git", ["-C", worktreePath, "merge-base", "--is-ancestor", subject, head], { stdio: "ignore" });
        ancestor = true;
      } catch {
        ancestor = false;
      }
      if (ancestor) {
        best = { candidate: subject, run: ledger.state.run.id, evidenceRef: event.data.evidenceRef, ts: event.ts };
      }
    }
  }
  if (!best) {
    return null;
  }
  return { candidate: best.candidate, run: best.run, evidenceRef: best.evidenceRef, range: `${best.candidate}..${head}` };
}
