import { CLI_VERSION } from "./constants.js";
import { formatDoctor, runDoctor } from "./doctor.js";
import { buildPlan, formatPlan } from "./planner.js";

const HELP = `Solobaton CLI v${CLI_VERSION} (lifecycle preview)

Usage:
  solobaton doctor [path] [--json]
  solobaton init [path] --dry-run [--layout default|compact] [--json]
  solobaton adopt [path] --dry-run [--layout default|compact] [--json]
  solobaton version

CLI v0 is read-only. init/adopt without --dry-run are rejected. Upgrade and
uninstall semantics are documented but intentionally not write-enabled yet.`;

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

function parse(args) {
  if (args.length === 0) {
    return { command: "help", target: ".", json: false, dryRun: false, layout: null };
  }
  const options = {
    command: args[0],
    target: ".",
    json: false,
    dryRun: false,
    layout: null,
    help: false,
  };
  let targetSeen = false;
  for (let index = 1; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--json") {
      options.json = true;
    } else if (token === "--dry-run") {
      options.dryRun = true;
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
    } else {
      throw new UsageError(`Unexpected argument: ${token}`);
    }
  }
  if (options.layout && !["default", "compact"].includes(options.layout)) {
    throw new UsageError("--layout must be default or compact.");
  }
  return options;
}

function outputJson(io, value) {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function writeError(io, message, json = false, code = "usage") {
  if (json) {
    outputJson(io, { ok: false, error: { code, message } });
  } else {
    io.stderr.write(`Error: ${message}\n`);
  }
}

export async function run(args, io = { stdout: process.stdout, stderr: process.stderr }) {
  let options;
  try {
    options = parse(args);
  } catch (error) {
    writeError(io, error.message, args.includes("--json"));
    return 2;
  }

  if (options.help || options.command === "help" || options.command === "--help") {
    io.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (options.command === "version" || options.command === "--version" || options.command === "-v") {
    io.stdout.write(`${CLI_VERSION}\n`);
    return 0;
  }

  try {
    if (options.command === "doctor") {
      if (options.layout || options.dryRun) {
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
      if (!options.dryRun) {
        writeError(
          io,
          "CLI v0 is read-only. Re-run with --dry-run; no project files were changed.",
          options.json,
          "write_phase_not_available",
        );
        return 2;
      }
      const layout = options.layout || (options.command === "adopt" ? "compact" : "default");
      const plan = buildPlan({ mode: options.command, target: options.target, layout });
      if (options.json) {
        outputJson(io, plan);
      } else {
        io.stdout.write(`${formatPlan(plan)}\n`);
      }
      return plan.ready ? 0 : 1;
    }

    if (["upgrade", "uninstall", "diff"].includes(options.command)) {
      writeError(
        io,
        `${options.command} is reserved by the lifecycle contract but is not enabled in CLI v0.`,
        options.json,
        "command_not_available",
      );
      return 2;
    }

    throw new UsageError(`Unknown command: ${options.command}`);
  } catch (error) {
    if (error instanceof UsageError) {
      writeError(io, error.message, options.json);
      return 2;
    }
    writeError(io, error.message, options.json, "runtime_error");
    return 1;
  }
}

export { HELP };
