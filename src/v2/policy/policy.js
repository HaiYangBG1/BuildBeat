// Built-in delivery checks, not a user-programmable rule language.
// Evidence and acceptance remain candidate/digest scoped and fail closed.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveRepoRef } from "../runtime/repo-ref.js";
import {
  fingerprintFinding,
  latestAdjudications,
  readFindingsFile,
} from "../runtime/findings.js";
export class PolicyError extends Error {}
const GRADES = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };
const SEVERITY = { P0: 0, P1: 1, P2: 2, P3: 3 };
export function sha256Text(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}
export function artifactAccepted(artifact, ctx) {
  if (!["work", "intent", "plan", "spec"].includes(artifact))
    throw new PolicyError("invalid artifact");
  const file = join(ctx.workDir, `${artifact}.md`);
  if (!existsSync(file))
    return { ok: "unverified", why: `artifact file missing: ${artifact}.md` };
  const path = join(ctx.workDir, "decisions.jsonl");
  const rows = existsSync(path)
    ? readFileSync(path, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  const accepted = rows
    .filter(
      (row) =>
        row.transition === `accept-${artifact}` && row.decision === "approved",
    )
    .at(-1);
  if (!accepted)
    return { ok: false, why: `artifact ${artifact} has never been accepted` };
  return accepted.subject?.digest === sha256Text(readFileSync(file, "utf8"))
    ? { ok: true, why: `artifact ${artifact} accepted at current digest` }
    : {
        ok: false,
        why: `artifact ${artifact} changed after its acceptance (stale acceptance)`,
      };
}
export function evidencePresent(
  { kind = "command", minGrade = "L2", step = null },
  ctx,
) {
  if (GRADES[minGrade] === undefined)
    return { ok: "unverified", why: `unknown grade ${minGrade}` };
  const hit = ctx.state.evidence.some(
    (e) =>
      e.kind === kind &&
      e.status === "passed" &&
      (GRADES[e.grade] ?? -1) >= GRADES[minGrade] &&
      (!ctx.candidate || e.subject === ctx.candidate) &&
      (!step || new RegExp(`(?:^|/)${step}-[0-9]+\\.log$`).test(e.ref ?? "")),
  );
  return {
    ok: hit,
    why: hit
      ? `evidence ${kind} present`
      : `no passed evidence of kind ${kind} at grade >= ${minGrade} for the current candidate`,
  };
}
// The screenshot set of a candidate is what its latest passed verify left
// (screenshot evidence links to that verify through `source`); screenshots
// of earlier verifies of the same candidate are history, not requirements.
export function currentScreenshots(evidence, candidate) {
  const verify = [...evidence]
    .reverse()
    .find(
      (e) =>
        e.kind === "command" &&
        e.status === "passed" &&
        (!candidate || e.subject === candidate) &&
        /(?:^|\/)verify-[0-9]+\.log$/.test(e.ref ?? ""),
    );
  if (!verify) return [];
  return evidence.filter(
    (e) =>
      e.kind === "screenshot" &&
      e.status === "passed" &&
      e.source === verify.ref &&
      (!candidate || e.subject === candidate),
  );
}
// Screenshots of the current candidate's latest verify; when the repository
// is known, each file must still hold the bytes its digest names.
export function screenshotsPresent(ctx) {
  const shots = currentScreenshots(ctx.state.evidence, ctx.candidate);
  if (!shots.length)
    return {
      ok: false,
      why: "no screenshot evidence for the current candidate",
    };
  if (ctx.repoRoot) {
    const changed = shots.filter((e) => {
      const path = resolveRepoRef(ctx.repoRoot, e.ref);
      return (
        !existsSync(path) ||
        `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}` !==
          e.digest
      );
    });
    if (changed.length)
      return {
        ok: false,
        why: `screenshot evidence no longer matches its file: ${changed.map((e) => e.ref).join(", ")}`,
      };
  }
  return {
    ok: true,
    why: `${shots.length} screenshot(s) for the current candidate`,
  };
}
export function reviewClear(atMost, ctx) {
  if (SEVERITY[atMost] === undefined)
    return { ok: "unverified", why: `unknown severity ${atMost}` };
  const reviews = ctx.state.evidence.filter(
    (e) =>
      e.kind === "review" && (!ctx.candidate || e.subject === ctx.candidate),
  );
  if (!reviews.length)
    return {
      ok: "unverified",
      why: "no review evidence for the current candidate",
    };
  // Adjudication is current Work-level authority. A no-op fix may keep the
  // candidate SHA, so an older unsuppressed review must not undo a later
  // dismissal. Conversely, a later accept must reopen a formerly suppressed
  // finding; historical suppression alone cannot override that decision.
  const rows = ctx.workDir
    ? readFindingsFile(join(ctx.workDir, "review-findings.jsonl"))
    : [];
  const adjudications = latestAdjudications(rows);
  const severe = reviews
    .flatMap((e) =>
      (e.findings ?? []).filter((f) => {
        const fingerprint = fingerprintFinding(f);
        const verdict = adjudications.get(fingerprint);
        return verdict
          ? verdict.action !== "dismiss"
          : !(e.suppressedFingerprints ?? []).includes(fingerprint);
      }),
    )
    .filter((f) => (SEVERITY[f.severity] ?? 0) < SEVERITY[atMost]);
  return {
    ok: severe.length === 0,
    why: severe.length
      ? `${severe.length} finding(s) more severe than ${atMost}`
      : `no findings above ${atMost}`,
  };
}
export function deliveryChecks({
  artifact = "plan",
  requireAcceptance = true,
  requireIntent = false,
  maxSeverity = "P2",
  requireScreenshot = false,
} = {}) {
  if (
    !["work", "plan"].includes(artifact) ||
    !["P2", "P3"].includes(maxSeverity) ||
    typeof requireScreenshot !== "boolean"
  )
    throw new PolicyError("invalid delivery safeguards");
  const rows = [];
  const add = (name, type, appliesTo, check) =>
    rows.push({
      name,
      type,
      appliesTo,
      enforcement: "LOCAL_ENFORCED",
      onFail: "WAIT_HUMAN",
      ...check,
    });
  if (requireIntent && artifact !== "work")
    add("intent-accepted", "pre", "build", {
      kind: "artifact",
      artifact: "intent",
    });
  if (requireAcceptance)
    add(`${artifact}-accepted`, "pre", "build", { kind: "artifact", artifact });
  add("merge-evidence-floor", "transition", "enter-wait-merge", {
    kind: "merge",
    maxSeverity,
    artifact,
    requireAcceptance,
    requireIntent,
    ...(requireScreenshot ? { requireScreenshot } : {}),
  });
  return rows;
}
export function evaluatePolicies(policies, { type, appliesTo }, ctx) {
  return (policies ?? [])
    .filter((p) => p.type === type && p.appliesTo === appliesTo)
    .map((p) => {
      let v;
      if (p.kind === "artifact") v = artifactAccepted(p.artifact, ctx);
      else if (p.kind === "evidence")
        v = evidencePresent(
          { kind: p.evidenceKind, minGrade: p.minGrade },
          ctx,
        );
      else if (p.kind === "merge") {
        v = evidencePresent(
          { kind: "command", minGrade: "L2", step: "verify" },
          ctx,
        );
        if (v.ok === true && p.requireAcceptance)
          v = artifactAccepted(p.artifact, ctx);
        if (v.ok === true && p.requireIntent && p.artifact !== "work")
          v = artifactAccepted("intent", ctx);
        // UI work proves its real render: screenshots the verify step left
        // for this candidate (lessons.md "静态稿拍板 → 返工螺旋").
        if (v.ok === true && p.requireScreenshot) v = screenshotsPresent(ctx);
        if (v.ok === true) v = reviewClear(p.maxSeverity ?? "P2", ctx);
      } else
        throw new PolicyError(
          "custom policy rules are retired; migrate using docs/MIGRATION.md",
        );
      return {
        policy: p.name,
        result:
          v.ok === true
            ? "PASS"
            : v.ok === "unverified"
              ? "UNVERIFIED"
              : (p.onFail ?? "WAIT_HUMAN"),
        reason: v.why,
        enforcement: p.enforcement ?? "LOCAL_ENFORCED",
      };
    });
}
