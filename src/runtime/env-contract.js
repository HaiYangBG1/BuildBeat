// Environment contract: a run config may declare the binaries (and minimum
// versions) its frozen envelope silently depends on, and the kernel checks
// them fail-closed before a run starts. Absorbed from real incidents: a
// frozen verifier needed `rg` that only a vendored PATH provided, candidate
// scripts assumed bash >= 4 on a /bin/bash 3.2 host, and a fresh shell
// resolved Node 14 — each burned runs before anyone saw the real cause.

import { spawnSync } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";

export class EnvContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "EnvContractError";
  }
}

// Version detection in --version output needs at least major.minor (a bare
// integer in arbitrary output is too easy to false-match); a declared min
// may be major-only ("20").
function parseVersion(text) {
  const match = String(text).match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

function parseMin(value) {
  const match = String(value).trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) {
      return (left[index] ?? 0) - (right[index] ?? 0);
    }
  }
  return 0;
}

// Checks every entry and reports all problems at once (a run that dies on
// the first missing binary hides the second). Non-zero --version exits are
// tolerated; only a spawn failure means "not runnable".
export function checkRequires(requires) {
  const problems = [];
  const checked = [];
  for (const entry of requires ?? []) {
    // Probe entries (iteration 08, C10): an environment fact that is not a
    // binary version — "Redis answers PING on the target", "python on the
    // host is >= 3.9" — expressed as a shell command whose exit code (and
    // optionally output) must match. Absorbed from the first-proof rerun:
    // Redis < 7 and Python 3.6 on the target burned a window each because
    // nothing checked them before the run.
    if (entry && typeof entry === "object" && typeof entry.probe === "string" && entry.probe.length > 0) {
      const label = entry.name ?? entry.probe;
      const run = spawnSync("bash", ["-lc", entry.probe], { encoding: "utf8", timeout: entry.timeoutMs ?? 30_000 });
      if (run.error) {
        problems.push(`${label}: probe could not run (${run.error.code ?? run.error.message})`);
        continue;
      }
      const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
      if (run.status !== 0) {
        problems.push(`${label}: probe exited ${run.status}${output.trim() ? ` — ${output.trim().split("\n").slice(-1)[0].slice(0, 160)}` : ""}`);
        continue;
      }
      if (entry.expect !== undefined) {
        let matcher;
        try {
          matcher = new RegExp(String(entry.expect));
        } catch {
          problems.push(`${label}: expect ${JSON.stringify(entry.expect)} is not a valid regular expression`);
          continue;
        }
        if (!matcher.test(output)) {
          problems.push(`${label}: probe output does not match expect ${JSON.stringify(entry.expect)}`);
          continue;
        }
      }
      checked.push({ command: label, version: null, probe: true });
      continue;
    }
    if (!entry || typeof entry !== "object" || typeof entry.command !== "string" || entry.command.length === 0) {
      problems.push(`requires entries need a command name or a probe, got: ${JSON.stringify(entry)}`);
      continue;
    }
    // A generous timeout: a missing binary fails instantly (ENOENT), while a
    // loaded host must not turn a present binary into a false "not runnable".
    const probe = spawnSync(entry.command, [entry.versionFlag ?? "--version"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    if (probe.error) {
      problems.push(
        `${entry.command}: not runnable in this environment (${probe.error.code ?? probe.error.message})`,
      );
      continue;
    }
    const version = parseVersion(`${probe.stdout ?? ""}\n${probe.stderr ?? ""}`);
    if (entry.min !== undefined) {
      const min = parseMin(entry.min);
      if (!min) {
        problems.push(`${entry.command}: min ${JSON.stringify(entry.min)} is not a version`);
        continue;
      }
      if (!version) {
        problems.push(
          `${entry.command}: version undetectable but min ${entry.min} is required (fail closed)`,
        );
        continue;
      }
      if (compareVersions(version, min) < 0) {
        problems.push(
          `${entry.command}: resolves to ${version.join(".")}, below required ${entry.min}`,
        );
        continue;
      }
    }
    checked.push({ command: entry.command, version: version ? version.join(".") : null });
  }
  return { ok: problems.length === 0, problems, checked };
}

export function assertRequires(requires) {
  const result = checkRequires(requires);
  if (!result.ok) {
    throw new EnvContractError(
      `environment contract not satisfied:\n  - ${result.problems.join("\n  - ")}`,
    );
  }
  return result;
}

// A worker's program this machine lacks (WORK-SINGLE-TOOL): the command, or the
// tool after "--" when the command is worker.sh or a shell running it. Looked
// up on the worker's PATH, vars filled into args as the runtime does.
export function missingWorkerTools(workers, { repoRoot, env = {}, vars = {} }) {
  const missing = [];
  for (const [worker, spec] of Object.entries(workers ?? {})) {
    const fill = (text) => Object.entries(vars).reduce((out, [key, value]) => out.replaceAll(`{vars.${key}}`, String(value)), String(text));
    const line = [String(spec.command), ...(spec.args ?? []).map(fill)];
    const shell = /(^|\/)(ba|z)?sh$/.test(line[0]);
    const at = line.findIndex((part, index) => /(^|\/)worker\.sh$/.test(part) && (index === 0 || (shell && line.slice(1, index).every((arg) => arg.startsWith("-")))));
    const wrapped = at >= 0 && line.includes("--", at);
    const tool = wrapped ? line[line.indexOf("--", at) + 1] : line[0];
    if (tool === undefined || tool === "") {
      missing.push({ worker, tool: null });
    } else if (!(wrapped && tool.includes("{")) && !runnable(tool, repoRoot, env[worker]?.PATH ?? process.env.PATH ?? "")) {
      missing.push({ worker, tool, path: tool.includes("/") });
    }
  }
  return missing;
}

const executable = (file) => { try { return accessSync(file, constants.X_OK) === undefined && statSync(file).isFile(); } catch { return false; } };

function runnable(tool, repoRoot, PATH) {
  if (tool.includes("/")) return executable(isAbsolute(tool) ? tool : join(repoRoot, tool));
  return PATH.split(delimiter).some((dir) => dir !== "" && executable(resolve(repoRoot, dir, tool)));
}
