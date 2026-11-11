// Envelope as a first-class run-config section (iteration 08, C6). The deploy
// campaign paid for every Run with a 34-line yaml, a 10 KB worker.sh and four
// prompt files, and each worker line was a `git show <meta sha>:path | bash`
// incantation. The kernel now does that part: it reads the prompt for the
// step's worker (optionally pinned to a commit), substitutes declared vars,
// materialises it into the run directory and hands the path to the worker as
// BUILDBEAT_PROMPT. The envelope digest is recorded on RUN_CREATED so "which
// prompts did this run see" is answerable from the ledger.
//
//   envelope:
//     prompts: run-envelope/prompts     # dir, relative to the run config
//     pin: <commit sha>                 # optional: read prompts from that commit
//     vars:
//       component: auth                 # {vars.component} in prompts and args
//
// Prompt lookup per worker: <component>-<worker>.md (when vars.component is
// set) then <worker>.md. Missing prompt for a configured worker is not an
// error — that worker simply gets no BUILDBEAT_PROMPT.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { canonicalJson } from "../storage/event-ledger.js";

export class EnvelopeError extends Error {
  constructor(message) {
    super(message);
    this.name = "EnvelopeError";
  }
}

function gitToplevel(dir) {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function readPinned(toplevel, pin, relPath) {
  try {
    return execFileSync("git", ["-C", toplevel, "show", `${pin}:${relPath}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

export function substituteVars(text, vars) {
  let out = String(text);
  for (const [key, value] of Object.entries(vars ?? {})) {
    out = out.replaceAll(`{vars.${key}}`, String(value));
  }
  return out;
}

// Loads every prompt the configured workers could use. Returns null when the
// run config declares no envelope.
export function loadEnvelope(config, configDir, workerNames) {
  const spec = config.envelope;
  if (spec === undefined) {
    return null;
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new EnvelopeError("envelope must be a map");
  }
  if (typeof spec.prompts !== "string" || spec.prompts.length === 0) {
    throw new EnvelopeError("envelope.prompts (a directory) is required");
  }
  const vars = spec.vars ?? {};
  if (!vars || typeof vars !== "object" || Array.isArray(vars)) {
    throw new EnvelopeError("envelope.vars must be a map");
  }
  for (const [key, value] of Object.entries(vars)) {
    if (!/^[A-Za-z0-9_.-]+$/.test(key) || (typeof value !== "string" && typeof value !== "number")) {
      throw new EnvelopeError(`envelope.vars.${key} must be a scalar`);
    }
  }
  const pin = spec.pin ?? null;
  if (pin !== null && !/^[0-9a-f]{7,40}$/.test(String(pin))) {
    throw new EnvelopeError(`envelope.pin must be a commit sha, got: ${pin}`);
  }
  // realpath: git reports the toplevel through resolved symlinks (macOS
  // /var → /private/var), so the config dir must be resolved the same way
  // before a repository-relative prompt path can be computed.
  const configReal = existsSync(configDir) ? realpathSync(configDir) : resolve(configDir);
  const promptsDir = resolve(configReal, spec.prompts);
  let toplevel = null;
  let promptsRel = null;
  if (pin) {
    toplevel = gitToplevel(configReal);
    if (!toplevel) {
      throw new EnvelopeError("envelope.pin needs the run config to live inside a git repository");
    }
    promptsRel = relative(toplevel, promptsDir).split("\\").join("/");
    if (promptsRel.startsWith("..")) {
      throw new EnvelopeError("envelope.prompts must be inside the repository that holds the run config when pinned");
    }
  }
  const component = vars.component !== undefined ? String(vars.component) : null;
  const prompts = {};
  for (const worker of workerNames) {
    const candidates = [];
    if (component) {
      candidates.push(`${component}-${worker}.md`);
    }
    candidates.push(`${worker}.md`);
    for (const name of candidates) {
      let text = null;
      if (pin) {
        text = readPinned(toplevel, String(pin), `${promptsRel}/${name}`);
      } else if (existsSync(join(promptsDir, name))) {
        text = readFileSync(join(promptsDir, name), "utf8");
      }
      if (text !== null) {
        prompts[worker] = { file: name, text: substituteVars(text, vars) };
        break;
      }
    }
  }
  if (Object.keys(prompts).length === 0) {
    throw new EnvelopeError(
      `envelope.prompts ${spec.prompts} holds no prompt for any configured worker (${workerNames.join(", ") || "none"})${pin ? ` at ${pin}` : ""}`,
    );
  }
  const digest = `sha256:${createHash("sha256")
    .update(canonicalJson({ prompts, vars, pin }), "utf8")
    .digest("hex")}`;
  return { prompts, vars, pin: pin ? String(pin) : null, digest, source: pin ? `${promptsRel}@${pin}` : spec.prompts };
}

// Writes the step's prompt into the run directory and returns its absolute
// path plus the repository-relative reference for the worker input.
export function materialisePrompt({ envelope, worker, runtimeDir, runId, step, attempt, repoRoot }) {
  const prompt = envelope?.prompts?.[worker];
  if (!prompt) {
    return null;
  }
  const dir = join(runtimeDir, "runs", runId, "prompts");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${step}-${attempt}.md`);
  writeFileSync(path, prompt.text, "utf8");
  return { path, ref: relative(repoRoot, path).split("\\").join("/"), file: prompt.file };
}

// Next attempt id for a run family: RUN-X → RUN-X-01, RUN-X-02, ... scanning
// both the runtime plane and the Git plane (run-records survive a runtime
// wipe, so numbering never collides with a compacted run).
export function nextAttemptId(repoRoot, workId, family) {
  const pattern = new RegExp(`^${family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d{2,})$`);
  let max = 0;
  const dirs = [
    join(repoRoot, ".buildbeat", "runtime", "runs"),
    join(repoRoot, "delivery", "work", workId, "runs"),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      continue;
    }
    for (const entry of readdirSafe(dir)) {
      const match = entry.match(pattern);
      if (match) {
        max = Math.max(max, Number(match[1]));
      }
    }
  }
  return `${family}-${String(max + 1).padStart(2, "0")}`;
}

function readdirSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
