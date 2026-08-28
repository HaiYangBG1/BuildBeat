// v2 domain constants. Source of truth: docs/v2/RFC-0002-domain-model.md and
// docs/v2/SPEC-0001-events-v1.md (FROZEN; additive-only evolution).

export const WORK_STATES = ["OPEN", "COMPLETED", "CANCELLED"];

export const RUN_STATES = [
  "CREATED",
  "QUEUED",
  "RUNNING",
  "WAITING_HUMAN",
  "BLOCKED",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "SUPERSEDED",
];

export const TERMINAL_RUN_STATES = ["SUCCEEDED", "FAILED", "CANCELLED", "SUPERSEDED"];

export const STEP_STATES = [
  "PENDING",
  "READY",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
  "CANCELLED",
];

export const GATE_RESULTS = ["PASS", "RETRY", "ROUTE", "WAIT_HUMAN", "BLOCK", "UNVERIFIED"];

export const ACTOR_KINDS = ["kernel", "worker", "human", "adapter", "provider"];

export const POLICY_PHASES = ["pre", "post", "transition", "action"];

export const STEP_FINISH_STATUSES = [
  "succeeded",
  "failed",
  "blocked",
  "invalid-output",
  "timeout",
  "crashed",
];

export const BUDGET_KINDS = ["attempts", "tokens", "cost", "time"];

export const EVIDENCE_STATUSES = ["passed", "failed", "unverified"];

export const EVIDENCE_GRADES = ["L0", "L1", "L2", "L3", "L4"];

export const DECISION_VALUES = ["approved", "rejected"];
