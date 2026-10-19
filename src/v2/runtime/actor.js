// Who made a decision, recorded as a fact rather than assumed. Every
// decision used to default to `by: "human"` and `actor.kind: "human"`, so an
// approval the driving AI session gave itself read exactly like one a person
// made (lessons.md 23: nine of ten mid-run stops were approved by the
// driving session, and the record could not tell). The kind comes from
// `--as`, or else from the host's AI-session markers; the name comes from
// `--by`, or else from git (people) or the detected tool (sessions).
// Detection is a default, not a guard: a session can still pass `--as human`
// and clear its environment.

import { execFileSync } from "node:child_process";

export const ACTOR_DECISION_KINDS = ["human", "agent"];

// First match wins. AI_AGENT is a cross-tool convention whose value names
// the tool (sometimes with a version suffix); BUILDBEAT_ACTOR=agent lets any
// other host declare itself.
const AGENT_MARKERS = [
  { env: "CLAUDECODE", name: () => "claude-code" },
  { env: "CODEX_SANDBOX", name: () => "codex" },
  // Desktop/full-access sessions keep a thread ID even without a sandbox.
  { env: "CODEX_THREAD_ID", name: () => "codex" },
  { env: "AI_AGENT", name: (value) => /^[A-Za-z][A-Za-z0-9.-]{0,39}/.exec(value)?.[0] ?? "ai-session" },
  { env: "BUILDBEAT_ACTOR", name: () => "ai-session", only: "agent" },
];

export class ActorError extends Error {
  constructor(message) {
    super(message);
    this.name = "ActorError";
  }
}

export function detectAgentSession(env = process.env) {
  for (const marker of AGENT_MARKERS) {
    const value = env[marker.env];
    if (typeof value !== "string" || value === "" || value === "0") continue;
    if (marker.only && value !== marker.only) continue;
    return { tool: marker.name(value), marker: marker.env };
  }
  return null;
}

function gitUserName(repoRoot) {
  try {
    const name = execFileSync("git", ["-C", repoRoot ?? ".", "config", "user.name"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return name || null;
  } catch {
    return null;
  }
}

// Returns { kind, id, source, via? }:
//   source: flag (--by), git (git user.name), env (detected AI tool),
//           default (--as agent with no name and no detected tool)
//   via: "agent-session" when a person's decision was entered from an AI
//        session (the session relays what the person said)
export function resolveActor({ by, as, repoRoot, env = process.env } = {}) {
  if (as !== undefined && !ACTOR_DECISION_KINDS.includes(as)) {
    throw new ActorError(`--as must be human or agent, got: ${as}`);
  }
  const session = detectAgentSession(env);
  const kind = as ?? (session ? "agent" : "human");
  const named = typeof by === "string" ? by.trim() : "";
  let id;
  let source;
  if (named) {
    id = named;
    source = "flag";
  } else if (kind === "agent") {
    id = session?.tool ?? "ai-session";
    source = session ? "env" : "default";
  } else {
    id = gitUserName(repoRoot);
    source = "git";
    if (!id) {
      throw new ActorError(
        "cannot tell who made this decision: pass --by <name> (git user.name is not set)",
      );
    }
  }
  return {
    kind,
    id,
    source,
    ...(kind === "human" && session ? { via: "agent-session" } : {}),
  };
}

// Runtime entry points take either a resolved `actor` or the raw flags.
export function actorFrom({ actor, by, as, repoRoot, env } = {}) {
  if (actor) {
    if (!ACTOR_DECISION_KINDS.includes(actor.kind) || typeof actor.id !== "string" || !actor.id) {
      throw new ActorError("actor must be {kind: human|agent, id}");
    }
    return actor;
  }
  return resolveActor({ by, as, repoRoot, env });
}

// The merge approval to call out on every status view: the latest one,
// when an AI session gave it under a recorded identity.
export function selfMergeApproval(decisions) {
  const latest = [...(decisions ?? [])].reverse().find((item) =>
    item.transition === "enter-wait-merge" && item.decision === "approved");
  return latest?.actor?.kind === "agent" && latest.actor.source ? latest : null;
}

// Plain-words label for a recorded decision row or ledger decision. Rows
// written before identities were recorded carry no actor (or a ledger actor
// without `source`): they say so instead of being guessed from the name.
export function describeActor(row) {
  const actor = row?.actor;
  const name = actor?.id ?? row?.by ?? "?";
  if (!actor || !actor.source) return `${name} (identity not recorded)`;
  if (actor.kind === "agent") return `${name} (AI session)`;
  if (actor.via === "agent-session") return `${name} (person, entered from an AI session)`;
  return `${name} (person)`;
}
