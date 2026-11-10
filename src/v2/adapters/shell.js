// Shell adapter: runs one configured command per step invocation inside the
// step's checkout. This is the vendor-neutral path to any CLI agent
// (claude -p, codex exec, plain scripts). Adapters never touch run state;
// they only return what actually happened, and the caller writes the events.

import { spawnSync } from "node:child_process";

export class AdapterConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "AdapterConfigError";
  }
}

function fillTemplate(text, context) {
  let out = text
    .replaceAll("{workspace}", context.workspacePath)
    .replaceAll("{step}", context.step)
    .replaceAll("{worker}", context.worker)
    .replaceAll("{prompt}", context.promptPath ?? "");
  for (const [key, value] of Object.entries(context.vars ?? {})) {
    out = out.replaceAll(`{vars.${key}}`, String(value));
  }
  return out;
}

// Workers get a minimal environment by default: host credentials living in
// env vars never reach a worker process unless the adapter explicitly opts
// in with inheritEnv (which doctor reports as ADVISORY-only isolation).
const DEFAULT_ENV_KEYS = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TERM", "USER", "SHELL"];

export function createShellAdapter(config) {
  if (!config || typeof config.command !== "string" || config.command.length === 0) {
    throw new AdapterConfigError("shell adapter requires a command");
  }
  const name = config.name ?? "shell";
  const envMode = config.inheritEnv === true ? "inherit" : "allowlist";
  return {
    name,
    envMode,
    execute({ step, worker, workspacePath, input, timeoutMs, outputPath, promptPath, vars, extraEnv }) {
      const context = { step, worker, workspacePath, promptPath, vars };
      const args = (config.args ?? []).map((arg) => fillTemplate(String(arg), context));
      const command = [config.command, ...args].join(" ");
      const startedAt = new Date().toISOString();
      let env;
      if (config.inheritEnv === true) {
        env = { ...process.env };
      } else {
        env = {};
        for (const key of DEFAULT_ENV_KEYS) {
          if (process.env[key] !== undefined) {
            env[key] = process.env[key];
          }
        }
      }
      Object.assign(env, config.env ?? {});
      env.BUILDBEAT_INPUT = JSON.stringify(input ?? {});
      if (outputPath) {
        env.BUILDBEAT_OUTPUT = outputPath;
      }
      if (promptPath) {
        env.BUILDBEAT_PROMPT = promptPath;
      }
      // Step-specific variables the kernel sets (BUILDBEAT_SCREENSHOT_DIR).
      Object.assign(env, extraEnv ?? {});

      const result = spawnSync(config.command, args, {
        cwd: workspacePath,
        encoding: "utf8",
        timeout: timeoutMs ?? config.timeoutMs,
        env,
        maxBuffer: 16 * 1024 * 1024,
      });
      const finishedAt = new Date().toISOString();
      return {
        adapter: name,
        command,
        exitCode: result.status,
        signal: result.signal ?? null,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        timedOut: result.error?.code === "ETIMEDOUT",
        spawnError: result.error && result.error.code !== "ETIMEDOUT" ? result.error.message : null,
        startedAt,
        finishedAt,
      };
    },
  };
}
