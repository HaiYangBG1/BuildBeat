// Policy engine per docs/v2/RFC-0003-workflow-policy.md §4. Policies are
// declarative YAML documents; rules evaluate under three-valued logic
// (true / false / "unverified") and UNVERIFIED is never treated as PASS.
// Parsing is fail-closed: unknown operators, types, or fields are rejected.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export class PolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "PolicyError";
  }
}

const POLICY_TYPES = ["pre", "post", "transition", "action"];
const ENFORCEMENTS = ["ADVISORY", "LOCAL_ENFORCED", "SERVER_ENFORCED"];
const ON_FAIL = ["WAIT_HUMAN", "BLOCK"];
const POLICY_FIELDS = new Set([
  "kind",
  "version",
  "name",
  "type",
  "appliesTo",
  "enforcement",
  "onFail",
  "rule",
]);
const GRADE_RANK = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };
const SEVERITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };

const OPERATORS = new Set([
  "all",
  "any",
  "not",
  "evidence.exists",
  "artifact.accepted",
  "attempts.lt",
  "budget.remaining",
  "candidate.clean",
  "human.approved",
  "finding.maxSeverity",
]);

function validateRule(rule, path = "rule") {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    throw new PolicyError(`${path} must be a map with exactly one operator`);
  }
  const keys = Object.keys(rule);
  if (keys.length !== 1) {
    throw new PolicyError(`${path} must have exactly one operator, got: ${keys.join(", ")}`);
  }
  const op = keys[0];
  if (!OPERATORS.has(op)) {
    throw new PolicyError(`${path}: unknown operator "${op}"`);
  }
  const arg = rule[op];
  if (op === "all" || op === "any") {
    if (!Array.isArray(arg) || arg.length === 0) {
      throw new PolicyError(`${path}.${op} requires a non-empty list of rules`);
    }
    arg.forEach((child, index) => validateRule(child, `${path}.${op}[${index}]`));
  } else if (op === "not") {
    validateRule(arg, `${path}.not`);
  }
  return rule;
}

export function parsePolicyDoc(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new PolicyError("policy document must be a map");
  }
  for (const key of Object.keys(doc)) {
    if (!POLICY_FIELDS.has(key)) {
      throw new PolicyError(`unknown field "${key}" in policy ${doc.name ?? "(unnamed)"}`);
    }
  }
  if (doc.kind !== "policy") {
    throw new PolicyError(`kind must be "policy", got: ${JSON.stringify(doc.kind)}`);
  }
  if (doc.version !== 1) {
    throw new PolicyError(`unsupported policy version: ${JSON.stringify(doc.version)}`);
  }
  if (typeof doc.name !== "string" || doc.name.length === 0) {
    throw new PolicyError("policy needs a name");
  }
  if (!POLICY_TYPES.includes(doc.type)) {
    throw new PolicyError(`policy ${doc.name}: type must be one of ${POLICY_TYPES.join("|")}`);
  }
  if (typeof doc.appliesTo !== "string" || doc.appliesTo.length === 0) {
    throw new PolicyError(`policy ${doc.name}: appliesTo is required`);
  }
  if (!ENFORCEMENTS.includes(doc.enforcement)) {
    throw new PolicyError(
      `policy ${doc.name}: enforcement must be one of ${ENFORCEMENTS.join("|")}`,
    );
  }
  if (doc.onFail !== undefined && !ON_FAIL.includes(doc.onFail)) {
    throw new PolicyError(`policy ${doc.name}: onFail must be one of ${ON_FAIL.join("|")}`);
  }
  validateRule(doc.rule, `policy ${doc.name} rule`);
  return {
    name: doc.name,
    type: doc.type,
    appliesTo: doc.appliesTo,
    enforcement: doc.enforcement,
    onFail: doc.onFail ?? "WAIT_HUMAN",
    rule: doc.rule,
  };
}

function combine(values, mode) {
  // Three-valued logic: false dominates all(), true dominates any(),
  // otherwise any "unverified" makes the result unverified.
  if (mode === "all") {
    if (values.some((value) => value.ok === false)) {
      return values.find((value) => value.ok === false);
    }
    if (values.some((value) => value.ok === "unverified")) {
      return values.find((value) => value.ok === "unverified");
    }
    return { ok: true, why: "all conditions hold" };
  }
  if (values.some((value) => value.ok === true)) {
    return { ok: true, why: "a condition holds" };
  }
  if (values.some((value) => value.ok === "unverified")) {
    return values.find((value) => value.ok === "unverified");
  }
  return { ok: false, why: values.map((value) => value.why).join("; ") };
}

export function sha256Text(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

// ctx: { state, workDir, worktreePath, readWorktree() -> {head, dirty} | null }
export function evaluateRule(rule, ctx) {
  const op = Object.keys(rule)[0];
  const arg = rule[op];
  switch (op) {
    case "all":
      return combine(arg.map((child) => evaluateRule(child, ctx)), "all");
    case "any":
      return combine(arg.map((child) => evaluateRule(child, ctx)), "any");
    case "not": {
      const inner = evaluateRule(arg, ctx);
      if (inner.ok === "unverified") {
        return inner;
      }
      return { ok: !inner.ok, why: `not(${inner.why})` };
    }
    case "evidence.exists": {
      const minRank = arg.minGrade !== undefined ? GRADE_RANK[arg.minGrade] : 0;
      if (minRank === undefined) {
        return { ok: "unverified", why: `unknown grade ${arg.minGrade}` };
      }
      // When the context names a candidate (e.g. a merge approval), only
      // evidence about that candidate counts — facts about superseded
      // candidates must not satisfy a gate for the current one.
      const scoped = ctx.candidate
        ? ctx.state.evidence.filter((item) => item.subject === ctx.candidate)
        : ctx.state.evidence;
      const hit = scoped.some(
        (item) =>
          item.kind === arg.kind &&
          item.status === "passed" &&
          (GRADE_RANK[item.grade] ?? -1) >= minRank,
      );
      return hit
        ? { ok: true, why: `evidence ${arg.kind} present` }
        : {
            ok: false,
            why: `no passed evidence of kind ${arg.kind}${arg.minGrade ? ` at grade >= ${arg.minGrade}` : ""}${ctx.candidate ? " for the current candidate" : ""}`,
          };
    }
    case "artifact.accepted": {
      const artifact = arg.artifact;
      const filePath = join(ctx.workDir, `${artifact}.md`);
      if (!existsSync(filePath)) {
        return { ok: "unverified", why: `artifact file missing: ${artifact}.md` };
      }
      const decisionsPath = join(ctx.workDir, "decisions.jsonl");
      if (!existsSync(decisionsPath)) {
        return { ok: false, why: `artifact ${artifact} has never been accepted` };
      }
      const accepts = readFileSync(decisionsPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter(
          (line) => line.transition === `accept-${artifact}` && line.decision === "approved",
        );
      if (accepts.length === 0) {
        return { ok: false, why: `artifact ${artifact} has never been accepted` };
      }
      const latest = accepts[accepts.length - 1];
      const currentDigest = sha256Text(readFileSync(filePath, "utf8"));
      if (latest.subject?.digest !== currentDigest) {
        return {
          ok: false,
          why: `artifact ${artifact} changed after its acceptance (stale acceptance)`,
        };
      }
      return { ok: true, why: `artifact ${artifact} accepted at current digest` };
    }
    case "attempts.lt": {
      const attempts = ctx.state.steps[arg.step]?.attempts ?? 0;
      return attempts < arg.max
        ? { ok: true, why: `${arg.step} attempts ${attempts} < ${arg.max}` }
        : { ok: false, why: `${arg.step} attempts ${attempts} reached ${arg.max}` };
    }
    case "budget.remaining": {
      const budget = ctx.state.budgets[arg.kind];
      if (!budget) {
        return { ok: true, why: `budget ${arg.kind} untouched` };
      }
      return budget.remaining > 0
        ? { ok: true, why: `budget ${arg.kind} remaining ${budget.remaining}` }
        : { ok: false, why: `budget ${arg.kind} exhausted` };
    }
    case "candidate.clean": {
      const tree = ctx.readWorktree();
      if (!tree) {
        return { ok: "unverified", why: "worktree not available for readback" };
      }
      return tree.dirty
        ? { ok: false, why: "worktree is dirty" }
        : { ok: true, why: "worktree is clean" };
    }
    case "human.approved": {
      const hit = ctx.state.approvals.some(
        (approval) => !approval.stale && approval.transition === arg.transition,
      );
      return hit
        ? { ok: true, why: `transition ${arg.transition} approved` }
        : { ok: false, why: `no active approval for transition ${arg.transition}` };
    }
    case "finding.maxSeverity": {
      const atMostRank = SEVERITY_RANK[arg.atMost];
      if (atMostRank === undefined) {
        return { ok: "unverified", why: `unknown severity ${arg.atMost}` };
      }
      // Findings against superseded candidates are history, not verdicts:
      // a blocked round-1 review that the fix loop already addressed must
      // not poison the gate for the final candidate. When the context
      // names a candidate, judge only reviews of that candidate.
      const reviews = ctx.state.evidence.filter(
        (item) =>
          item.kind === "review" && (!ctx.candidate || item.subject === ctx.candidate),
      );
      if (reviews.length === 0) {
        return {
          ok: "unverified",
          why: ctx.candidate
            ? "no review evidence for the current candidate"
            : "no review evidence to judge findings",
        };
      }
      const findings = reviews.flatMap((item) => item.findings ?? []);
      const tooSevere = findings.filter(
        (finding) => (SEVERITY_RANK[finding.severity] ?? 0) < atMostRank,
      );
      return tooSevere.length === 0
        ? { ok: true, why: `no findings above ${arg.atMost}` }
        : {
            ok: false,
            why: `${tooSevere.length} finding(s) more severe than ${arg.atMost}`,
          };
    }
    default:
      return { ok: "unverified", why: `unknown operator ${op}` };
  }
}

// Evaluates every policy of `type` whose appliesTo matches; returns rows of
// { policy, result, reason, enforcement } where result is a GateResult.
export function evaluatePolicies(policies, { type, appliesTo }, ctx) {
  const rows = [];
  for (const policy of policies ?? []) {
    if (policy.type !== type || policy.appliesTo !== appliesTo) {
      continue;
    }
    const verdict = evaluateRule(policy.rule, ctx);
    let result;
    if (verdict.ok === true) {
      result = "PASS";
    } else if (verdict.ok === "unverified") {
      result = "UNVERIFIED";
    } else {
      result = policy.onFail;
    }
    rows.push({
      policy: policy.name,
      result,
      reason: verdict.why,
      enforcement: policy.enforcement,
    });
  }
  return rows;
}
