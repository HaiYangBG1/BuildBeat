// Append-only per-run event ledger per docs/v2/SPEC-0001-events-v1.md (FROZEN).
// The ledger is the only runtime authority; snapshots are disposable. On any
// chain violation the ledger truncates at the last valid line and refuses
// further appends — recovery is a human decision, never a silent repair.

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { ENVELOPE_VERSION, GENESIS_DIGEST, validateEventInput } from "../domain/event-registry.js";
import { applyEvent, initialState } from "../engine/reducer.js";

export class LedgerError extends Error {
  constructor(message) {
    super(message);
    this.name = "LedgerError";
  }
}

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new TypeError(`unsupported value in event payload: ${typeof value}`);
}

export function eventDigest(event) {
  const body = { ...event };
  delete body.digest;
  const hex = createHash("sha256").update(canonicalJson(body), "utf8").digest("hex");
  return `sha256:${hex}`;
}

// Default reducer is the run reducer; other streams (observe) plug their own
// reducer while keeping the exact same envelope, chain and corruption rules.
const RUN_REDUCER = { initialState, applyEvent };

export class EventLedger {
  #run = null;
  #work = null;
  #reducer;

  constructor(filePath, reducer = RUN_REDUCER) {
    this.path = filePath;
    this.events = [];
    this.corruption = null;
    this.#reducer = reducer;
    this.state = reducer.initialState();
    this.lastDigest = GENESIS_DIGEST;
  }

  static open(filePath, reducer = RUN_REDUCER) {
    const ledger = new EventLedger(filePath, reducer);
    if (existsSync(filePath)) {
      ledger.#load();
    }
    return ledger;
  }

  #fail(atLine, reason) {
    this.corruption = { atLine, afterSeq: this.state.seq, reason };
  }

  #load() {
    const lines = readFileSync(this.path, "utf8")
      .split("\n")
      .filter((line) => line.length > 0);
    for (const [index, line] of lines.entries()) {
      const atLine = index + 1;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        this.#fail(atLine, "invalid JSON");
        return;
      }
      if (event.v !== ENVELOPE_VERSION) {
        this.#fail(atLine, `unsupported envelope version: ${event.v}`);
        return;
      }
      if (event.prev !== this.lastDigest) {
        this.#fail(atLine, "hash chain broken: prev mismatch");
        return;
      }
      if (eventDigest(event) !== event.digest) {
        this.#fail(atLine, "digest mismatch");
        return;
      }
      if (event.seq !== this.state.seq + 1) {
        this.#fail(atLine, `sequence gap: expected ${this.state.seq + 1}, got ${event.seq}`);
        return;
      }
      try {
        this.state = this.#reducer.applyEvent(this.state, event);
      } catch (error) {
        this.#fail(atLine, `illegal event sequence: ${error.message}`);
        return;
      }
      this.events.push(event);
      this.lastDigest = event.digest;
      this.#run ??= event.run;
      this.#work ??= event.work;
    }
  }

  append({ type, actor, data, ts, run, work }) {
    if (this.corruption) {
      throw new LedgerError(
        `ledger corrupted after seq=${this.corruption.afterSeq} (${this.corruption.reason}); ` +
          "recovery requires a human decision",
      );
    }
    validateEventInput(type, actor, data);
    const runId = run ?? this.#run;
    const workId = work ?? this.#work;
    if (!runId || !workId) {
      throw new LedgerError("first event must carry run and work ids");
    }
    if ((run && this.#run && run !== this.#run) || (work && this.#work && work !== this.#work)) {
      throw new LedgerError("run/work id mismatch with ledger identity");
    }
    const event = {
      v: ENVELOPE_VERSION,
      seq: this.state.seq + 1,
      ts: ts ?? new Date().toISOString(),
      run: runId,
      work: workId,
      type,
      actor,
      data,
      prev: this.lastDigest,
    };
    event.digest = eventDigest(event);
    const nextState = this.#reducer.applyEvent(this.state, event);
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(event)}\n`, "utf8");
    this.events.push(event);
    this.state = nextState;
    this.lastDigest = event.digest;
    this.#run ??= runId;
    this.#work ??= workId;
    return event;
  }
}
