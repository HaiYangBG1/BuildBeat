// Shell adapter: runs one configured command per step invocation inside the
// step's workspace. This is the vendor-neutral path to any CLI agent
// (claude -p, codex exec, plain scripts). Adapters never touch kernel state;
// they only return what actually happened — the orchestrator writes events.
//
// Live output (iteration 08): when the orchestrator hands over a liveDir the
// child's stdout/stderr stream straight into files there while it runs, and a
// live.json marker names the command and its start time. `status` reads
// those to answer "is it still doing something?" — the question the owner
// asked a dozen times during the deploy campaign while a buffered spawnSync
// showed nothing until the step ended. The marker and the streams are
// removed once the step returns; the evidence log is still written by the
// collector from what was read back.

import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

export const LIVE_MARKER = "live.json";

export function liveStreamPaths(liveDir, step, attempt) {
  return {
    marker: join(liveDir, LIVE_MARKER),
    stdout: join(liveDir, `${step}-${attempt}.stdout.live`),
    stderr: join(liveDir, `${step}-${attempt}.stderr.live`),
  };
}

function readLive(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

export function createShellAdapter(config) {
  if (!config || typeof config.command !== "string" || config.command.length === 0) {
    throw new AdapterConfigError("shell adapter requires a command");
  }
  const name = config.name ?? "shell";
  const envMode = config.inheritEnv === true ? "inherit" : "allowlist";
  return {
    name,
    envMode,
    execute({ step, worker, workspacePath, input, timeoutMs, outputPath, liveDir, promptPath, vars }) {
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

      let live = null;
      let stdio = "pipe";
      if (liveDir) {
        mkdirSync(liveDir, { recursive: true });
        const paths = liveStreamPaths(liveDir, step, input?.attempt ?? 0);
        const outFd = openSync(paths.stdout, "w");
        const errFd = openSync(paths.stderr, "w");
        writeFileSync(
          paths.marker,
          `${JSON.stringify({ step, attempt: input?.attempt ?? null, worker, command, startedAt, stdout: paths.stdout, stderr: paths.stderr })}\n`,
          "utf8",
        );
        live = { paths, outFd, errFd };
        stdio = ["ignore", outFd, errFd];
      }

      let result;
      try {
        result = spawnSync(config.command, args, {
          cwd: workspacePath,
          encoding: "utf8",
          timeout: timeoutMs ?? config.timeoutMs,
          env,
          maxBuffer: 16 * 1024 * 1024,
          stdio,
        });
      } finally {
        if (live) {
          closeSync(live.outFd);
          closeSync(live.errFd);
        }
      }
      const finishedAt = new Date().toISOString();
      let stdout = result.stdout ?? "";
      let stderr = result.stderr ?? "";
      if (live) {
        stdout = readLive(live.paths.stdout);
        stderr = readLive(live.paths.stderr);
        rmSync(live.paths.marker, { force: true });
        rmSync(live.paths.stdout, { force: true });
        rmSync(live.paths.stderr, { force: true });
      }
      return {
        adapter: name,
        command,
        exitCode: result.status,
        signal: result.signal ?? null,
        stdout,
        stderr,
        timedOut: result.error?.code === "ETIMEDOUT",
        spawnError: result.error && result.error.code !== "ETIMEDOUT" ? result.error.message : null,
        startedAt,
        finishedAt,
      };
    },
  };
}
