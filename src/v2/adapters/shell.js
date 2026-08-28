// Shell adapter: runs one configured command per step invocation inside the
// step's workspace. This is the vendor-neutral path to any CLI agent
// (claude -p, codex exec, plain scripts). Adapters never touch kernel state;
// they only return what actually happened — the orchestrator writes events.

import { spawnSync } from "node:child_process";

export class AdapterConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "AdapterConfigError";
  }
}

function fillTemplate(text, context) {
  return text
    .replaceAll("{workspace}", context.workspacePath)
    .replaceAll("{step}", context.step)
    .replaceAll("{worker}", context.worker);
}

export function createShellAdapter(config) {
  if (!config || typeof config.command !== "string" || config.command.length === 0) {
    throw new AdapterConfigError("shell adapter requires a command");
  }
  const name = config.name ?? "shell";
  return {
    name,
    execute({ step, worker, workspacePath, input, timeoutMs }) {
      const context = { step, worker, workspacePath };
      const args = (config.args ?? []).map((arg) => fillTemplate(String(arg), context));
      const startedAt = new Date().toISOString();
      const result = spawnSync(config.command, args, {
        cwd: workspacePath,
        encoding: "utf8",
        timeout: timeoutMs ?? config.timeoutMs,
        env: { ...process.env, BUILDBEAT_INPUT: JSON.stringify(input ?? {}) },
        maxBuffer: 16 * 1024 * 1024,
      });
      const finishedAt = new Date().toISOString();
      return {
        adapter: name,
        command: [config.command, ...args].join(" "),
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
