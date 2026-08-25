import { createInterface } from "node:readline/promises";

import { CLI_VERSION, OUTPUT_SCHEMA_VERSION } from "./constants.js";
import { formatDoctor, runDoctor } from "./doctor.js";
import { buildPlan, formatPlan } from "./planner.js";
import { applyUpgrade, buildUpgradePlan, formatUpgradePlan } from "./upgrader.js";
import { applyScaffold, WriteError } from "./writer.js";

const HELP = `BuildBeat CLI v${CLI_VERSION} (Wave 2 source candidate)

Usage:
  buildbeat doctor [path] [--json]
  buildbeat init [path] [--dry-run] [--layout default|compact] [--json] [--yes]
  buildbeat adopt [path] [--dry-run] [--layout default|compact] [--json] [--yes]
  buildbeat upgrade [path] [--dry-run] [--json] [--force] [--major]
  buildbeat version

init/adopt write only after a blocker-free plan and confirmation; --yes skips
only that prompt. upgrade is schema-2-only and requires a clean target-root Git
worktree. diff and uninstall remain unavailable.

Legacy compatibility: the published npm package and solobaton executable alias
remain available during the BuildBeat namespace migration.`;

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

function parse(args) {
  if (args.length === 0) {
    return {
      command: "help",
      target: ".",
      json: false,
      dryRun: false,
      layout: null,
      yes: false,
      force: false,
      major: false,
      targetProvided: false,
    };
  }
  const options = {
    command: args[0],
    target: ".",
    json: false,
    dryRun: false,
    yes: false,
    force: false,
    major: false,
    layout: null,
    help: false,
    targetProvided: false,
  };
  let targetSeen = false;
  for (let index = 1; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--json") {
      options.json = true;
    } else if (token === "--dry-run") {
      options.dryRun = true;
    } else if (token === "--yes") {
      options.yes = true;
    } else if (token === "--force") {
      options.force = true;
    } else if (token === "--major") {
      options.major = true;
    } else if (token === "--help" || token === "-h") {
      options.help = true;
    } else if (token === "--layout") {
      index += 1;
      if (index >= args.length) {
        throw new UsageError("--layout requires default or compact.");
      }
      options.layout = args[index];
    } else if (token.startsWith("--layout=")) {
      options.layout = token.slice("--layout=".length);
    } else if (token.startsWith("-")) {
      throw new UsageError(`Unknown option: ${token}`);
    } else if (!targetSeen) {
      options.target = token;
      targetSeen = true;
      options.targetProvided = true;
    } else {
      throw new UsageError(`Unexpected argument: ${token}`);
    }
  }
  if (options.layout && !["default", "compact"].includes(options.layout)) {
    throw new UsageError("--layout must be default or compact.");
  }
  return options;
}

async function confirmPlan(io, plan) {
  if (typeof io.confirm === "function") {
    return Boolean(await io.confirm(plan));
  }
  if (!io.stdin?.isTTY || !io.stderr) {
    return null;
  }
  const readline = createInterface({ input: io.stdin, output: io.stderr });
  try {
    const answer = await readline.question("Apply this BuildBeat plan? [y/N] ");
    return /^(?:y|yes)$/i.test(answer.trim());
  } finally {
    readline.close();
  }
}

function outputJson(io, value) {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function commandLabel(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || null;
}

function writeError(io, message, { json = false, code = "usage", command = null } = {}) {
  if (json) {
    outputJson(io, {
      schemaVersion: OUTPUT_SCHEMA_VERSION,
      command: commandLabel(command),
      cliVersion: CLI_VERSION,
      ok: false,
      error: { code, message },
    });
  } else {
    io.stderr.write(`Error: ${message}\n`);
  }
}

export async function run(
  args,
  io = { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
) {
  let options;
  try {
    options = parse(args);
  } catch (error) {
    writeError(io, error.message, {
      json: args.includes("--json"),
      command: args[0] || null,
    });
    return 2;
  }

  if (options.help || options.command === "help" || options.command === "--help") {
    io.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (options.command === "version" || options.command === "--version" || options.command === "-v") {
    if (
      options.targetProvided ||
      options.json ||
      options.dryRun ||
      options.yes ||
      options.force ||
      options.major ||
      options.layout
    ) {
      writeError(io, "version does not accept a path or options.", {
        json: options.json,
        command: options.command,
      });
      return 2;
    }
    io.stdout.write(`${CLI_VERSION}\n`);
    return 0;
  }

  try {
    if (options.command === "doctor") {
      if (options.layout || options.dryRun || options.yes || options.force || options.major) {
        throw new UsageError("doctor accepts only [path] and --json.");
      }
      const report = runDoctor(options.target);
      if (options.json) {
        outputJson(io, report);
      } else {
        io.stdout.write(`${formatDoctor(report)}\n`);
      }
      return report.ok ? 0 : 1;
    }

    if (options.command === "init" || options.command === "adopt") {
      if (options.force || options.major) {
        throw new UsageError(`${options.command} does not accept --force or --major.`);
      }
      if (options.dryRun && options.yes) {
        throw new UsageError("--yes cannot be combined with --dry-run.");
      }
      const layout = options.layout || (options.command === "adopt" ? "compact" : "default");
      const now = new Date();
      const plan = buildPlan({
        mode: options.command,
        target: options.target,
        layout,
        preview: options.dryRun,
        now,
      });

      if (options.dryRun || !plan.ready) {
        if (options.json) {
          outputJson(io, plan);
        } else {
          io.stdout.write(`${formatPlan(plan)}\n`);
        }
        return plan.ready ? 0 : 1;
      }

      if (!options.json) {
        io.stdout.write(`${formatPlan(plan)}\n`);
      } else if (options.yes || io.stdin?.isTTY) {
        io.stderr.write(`${formatPlan(plan)}\n`);
      }

      if (!options.yes) {
        const confirmed = await confirmPlan(io, plan);
        if (confirmed === null) {
          writeError(
            io,
            "Interactive confirmation is unavailable. Re-run with --yes only after reviewing --dry-run output.",
            {
              json: options.json,
              code: "confirmation_required",
              command: options.command,
            },
          );
          return 2;
        }
        if (!confirmed) {
          if (options.json) {
            outputJson(io, { ...plan, cancelled: true });
          } else {
            io.stdout.write("\nCancelled. No files changed.\n");
          }
          return 0;
        }
      }

      const result = applyScaffold(plan, { now });
      if (options.json) {
        outputJson(io, result);
      } else {
        io.stdout.write(`\n${formatPlan(result)}\n`);
      }
      return 0;
    }

    if (options.command === "upgrade") {
      if (options.layout || options.yes) {
        throw new UsageError("upgrade accepts only [path], --dry-run, --json, --force, and --major.");
      }
      const now = new Date();
      const plan = buildUpgradePlan({
        target: options.target,
        preview: options.dryRun,
        force: options.force,
        major: options.major,
        now,
      });
      if (options.dryRun || !plan.ready || plan.upToDate) {
        if (options.json) {
          outputJson(io, plan);
        } else {
          io.stdout.write(`${formatUpgradePlan(plan)}\n`);
        }
        return plan.ready ? 0 : 1;
      }

      if (options.json) {
        io.stderr.write(`${formatUpgradePlan(plan)}\n`);
      } else {
        io.stdout.write(`${formatUpgradePlan(plan)}\n`);
      }
      const result = applyUpgrade(plan, { now });
      if (options.json) {
        outputJson(io, result);
      } else {
        io.stdout.write(`\n${formatUpgradePlan(result)}\n`);
      }
      return result.doctor?.ok === false ? 1 : 0;
    }

    if (["uninstall", "diff"].includes(options.command)) {
      writeError(
        io,
        `${options.command} is reserved by the lifecycle contract but is not enabled in this CLI build.`,
        {
          json: options.json,
          code: "command_not_available",
          command: options.command,
        },
      );
      return 2;
    }

    throw new UsageError(`Unknown command: ${options.command}`);
  } catch (error) {
    if (error instanceof UsageError) {
      writeError(io, error.message, { json: options.json, command: options.command });
      return 2;
    }
    writeError(io, error.message, {
      json: options.json,
      code: error instanceof WriteError ? error.code : "runtime_error",
      command: options.command,
    });
    return 1;
  }
}

export { HELP };
