// Deterministic reducer for the observe ledger (RFC-0003 §8, implemented M5).
// Shares envelope/chain rules with the run ledger via EventLedger's pluggable
// reducer; state here is a runtime view only — triage terminal state lives in
// the Git-plane intent draft files (invariant 23: runtime is deletable).

export class IllegalObserveEventError extends Error {
  constructor(message) {
    super(message);
    this.name = "IllegalObserveEventError";
  }
}

export function observeInitialState() {
  return {
    seq: 0,
    cycles: 0,
    activeCycle: null,
    providers: {},
    evidence: [],
    bands: [],
    intents: {},
    triage: [],
  };
}

export function applyObserveEvent(state, event) {
  if (event.seq !== state.seq + 1) {
    throw new IllegalObserveEventError(`expected seq ${state.seq + 1}, got ${event.seq}`);
  }
  const { type, data } = event;
  const next = structuredClone(state);
  next.seq = event.seq;

  switch (type) {
    case "OBSERVE_CYCLE_STARTED": {
      if (state.activeCycle !== null) {
        // A crashed cycle never finished; the new cycle supersedes it. Facts
        // already appended stand; nothing is repaired.
        next.activeCycle = null;
      }
      if (data.cycle !== state.cycles + 1) {
        throw new IllegalObserveEventError(
          `expected cycle ${state.cycles + 1}, got ${data.cycle}`,
        );
      }
      next.activeCycle = { cycle: data.cycle, configDigest: data.configDigest, ts: event.ts };
      next.cycles = data.cycle;
      break;
    }
    case "OBSERVE_CYCLE_FINISHED": {
      if (!state.activeCycle || state.activeCycle.cycle !== data.cycle) {
        throw new IllegalObserveEventError(`no active cycle ${data.cycle} to finish`);
      }
      next.activeCycle = null;
      break;
    }
    case "EVIDENCE_RECORDED": {
      next.evidence.push({
        ref: data.evidenceRef,
        kind: data.kind,
        subject: data.subject,
        digest: data.digest,
        status: data.status,
        grade: data.grade,
        ...(data.provider ? { provider: data.provider } : {}),
        ...(data.cycle !== undefined ? { cycle: data.cycle } : {}),
      });
      if (data.provider) {
        next.providers[data.provider] = {
          lastStatus: data.status,
          lastKind: data.kind,
          lastSubject: data.subject,
          lastEvidenceRef: data.evidenceRef,
          lastTs: event.ts,
        };
      }
      break;
    }
    case "BAND_TRIGGERED": {
      next.bands.push({
        provider: data.provider,
        band: data.band,
        severity: data.severity,
        fingerprint: data.fingerprint,
        ts: event.ts,
      });
      break;
    }
    case "INTENT_DRAFTED": {
      next.intents[data.fingerprint] = {
        intentRef: data.intentRef,
        provider: data.provider,
        severity: data.severity,
        ts: event.ts,
      };
      break;
    }
    case "TRIAGE_RECORDED": {
      next.triage.push({
        intentRef: data.intentRef,
        action: data.action,
        fingerprint: data.fingerprint,
        ts: event.ts,
      });
      break;
    }
    default:
      // Unknown type written by a newer version: preserved, skipped.
      break;
  }
  return next;
}

export const OBSERVE_REDUCER = {
  initialState: observeInitialState,
  applyEvent: applyObserveEvent,
};
