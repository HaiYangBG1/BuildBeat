// Initial event type registry v1 per docs/v2/SPEC-0001-events-v1.md §4.
// Semantics are frozen; the registry and per-type data may only grow additively.

import {
  ACTOR_KINDS,
  BUDGET_KINDS,
  DECISION_VALUES,
  EVIDENCE_GRADES,
  EVIDENCE_STATUSES,
  GATE_RESULTS,
  POLICY_PHASES,
  STEP_FINISH_STATUSES,
  TERMINAL_RUN_STATES,
} from "./model.js";

export const ENVELOPE_VERSION = 1;
export const GENESIS_DIGEST = "sha256:GENESIS";

export const EVENT_REGISTRY = {
  RUN_CREATED: ["workflowRef", "workflowDigest", "base", "riskPreset"],
  RUN_STARTED: [],
  WORKSPACE_BOUND: ["workspaceId", "repo", "branch", "worktreePath", "base"],
  STEP_STARTED: ["step", "attempt", "worker", "adapter", "workspaceId"],
  STEP_FINISHED: ["step", "attempt", "status"],
  CANDIDATE_PINNED: ["workspaceId", "base", "candidate"],
  EVIDENCE_RECORDED: ["evidenceRef", "kind", "subject", "digest", "status", "grade"],
  POLICY_EVALUATED: ["policy", "phase", "result", "enforcement", "reason"],
  TRANSITION: ["from", "to", "cause"],
  FAILURE_FINGERPRINT: ["step", "command", "exitCode", "errorDigest", "diffDigest"],
  BUDGET_CONSUMED: ["kind", "amount", "remaining"],
  HUMAN_REQUESTED: ["transition", "subject", "reasons"],
  DECISION_RECORDED: ["decision", "transition", "subject", "decisionRef"],
  APPROVAL_STALE: ["approvalRef", "changed"],
  CHECKPOINT: ["resumePoint", "workspaceStates"],
  RUN_INTERRUPTED: ["cause"],
  RUN_TERMINAL: ["status", "reason"],
  RUN_COMPACTED: ["runRecordRef", "runRecordDigest"],
};

const EVENT_ENUMS = {
  STEP_FINISHED: { status: STEP_FINISH_STATUSES },
  POLICY_EVALUATED: { phase: POLICY_PHASES, result: GATE_RESULTS },
  RUN_TERMINAL: { status: TERMINAL_RUN_STATES },
  BUDGET_CONSUMED: { kind: BUDGET_KINDS },
  DECISION_RECORDED: { decision: DECISION_VALUES },
  EVIDENCE_RECORDED: { status: EVIDENCE_STATUSES, grade: EVIDENCE_GRADES },
};

export class EventInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "EventInputError";
  }
}

export function validateEventInput(type, actor, data) {
  const required = EVENT_REGISTRY[type];
  if (!required) {
    throw new EventInputError(`unknown event type: ${type}`);
  }
  if (
    !actor ||
    typeof actor !== "object" ||
    !ACTOR_KINDS.includes(actor.kind) ||
    typeof actor.id !== "string" ||
    actor.id.length === 0
  ) {
    throw new EventInputError(`event ${type} requires actor {kind in ${ACTOR_KINDS.join("|")}, id}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new EventInputError(`event ${type} requires a data object`);
  }
  for (const field of required) {
    if (data[field] === undefined) {
      throw new EventInputError(`event ${type} missing required data field: ${field}`);
    }
  }
  const enums = EVENT_ENUMS[type];
  if (enums) {
    for (const [field, allowed] of Object.entries(enums)) {
      if (!allowed.includes(data[field])) {
        throw new EventInputError(
          `event ${type} field ${field} must be one of ${allowed.join("|")}, got: ${data[field]}`,
        );
      }
    }
  }
}
