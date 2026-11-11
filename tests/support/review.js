// Fixtures for tests that need a repository with works in it: a project run
// config, an accepted work.md, commits, and reviews of those commits.
//
// Two ways to get a review: `review()` goes through the CLI with the shell
// workers of the fixture's run config, the way a session does; `reviewWith()`
// calls the runtime with workers written in the test, which is quicker and
// lets a test decide exactly what verify and the reviewer return.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { acceptWork, approveReview } from "../../src/v2/runtime/decisions.js";
import { nextAttemptId } from "../../src/v2/runtime/envelope.js";
import { reviewCommit } from "../../src/v2/runtime/orchestrator.js";
import { tempDir } from "./tmp.js";

export const ROOT = join(import.meta.dirname, "..", "..");
export const CLI = join(ROOT, "bin", "buildbeat.js");

export function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

// Runs the CLI; never throws. `all` is stdout followed by stderr.
export function cli(args, { cwd, env } = {}) {
  const result = spawnSync("node", [CLI, ...args], {
    encoding: "utf8",
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
  });
  return { status: result.status, out: result.stdout, err: result.stderr, all: `${result.stdout}${result.stderr}` };
}

export const yaml = (lines) => `${lines.join("\n")}\n`;

// The fixture's project run config. The verifier wants src/feature.txt; the
// reviewer reports whatever findings.json the commit carries, and nothing
// when there is none.
export const PROJECT_CONFIG = yaml([
  "workers:",
  "  verifier:",
  "    command: bash",
  "    args:",
  "      - -lc",
  "      - test -f src/feature.txt",
  "  reviewer:",
  "    command: sh",
  "    args:",
  "      - tools/reviewer.sh",
]);

const REVIEWER = [
  "#!/bin/sh",
  'if [ -f findings.json ]; then cat findings.json > "$BUILDBEAT_OUTPUT"; else printf \'{"findings":[]}\' > "$BUILDBEAT_OUTPUT"; fi',
  "",
].join("\n");

export const WORK_MD = "# Add the feature\n\n## Goal\nA feature file.\n";

export function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

// Writes the files (null removes one), commits everything and returns the
// commit. A message may carry a "Work: <ID>" trailer.
export function commit(root, message, files = {}) {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) git(root, ["rm", "-q", path]);
    else write(root, path, text);
  }
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "--allow-empty", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

// An empty repository on branch main with one baseline commit.
export function emptyRepo(prefix = "bb-v2-") {
  const root = tempDir(prefix);
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  return root;
}

// Adds a work to a repository: commits its work.md (and its own run config,
// when given), which is where the work starts, and accepts it unless told
// not to. Returns that commit.
export function addWork(root, work, { text = WORK_MD, workConfig = null, accept = true, by = "owner" } = {}) {
  const base = commit(root, `describe ${work}`, {
    ...(workConfig === null ? {} : { [`delivery/work/${work}/run-config.yaml`]: workConfig }),
    [`delivery/work/${work}/work.md`]: text,
  });
  if (accept) {
    acceptWork(root, work, { by, as: "human" });
  }
  return base;
}

// A repository with the project run config and the reviewer script, then one
// work (WORK-A unless named) whose work.md commit is `base`.
export function fixture({ prefix = "bb-v2-review-", work = "WORK-A", projectConfig = PROJECT_CONFIG, workConfig = null, accept = true } = {}) {
  const root = emptyRepo(prefix);
  commit(root, "baseline", {
    ".gitignore": ".buildbeat/\n",
    "tools/reviewer.sh": REVIEWER,
    ...(projectConfig === null ? {} : { "delivery/run-config.yaml": projectConfig }),
  });
  const base = addWork(root, work, { workConfig, accept });
  return { root, base, work };
}

export const review = (root, work = "WORK-A", extra = []) => cli(["review", "--repo", root, "--work", work, ...extra]);
export const decide = (root, work, args) => cli(["decide", "--repo", root, "--work", work, "--by", "owner", "--as", "human", ...args]);

export const record = (root, work, run) =>
  JSON.parse(readFileSync(join(root, "delivery", "work", work, "runs", run, "run-record.json"), "utf8"));
export const jsonl = (root, work, name) =>
  readFileSync(join(root, "delivery", "work", work, name), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
export const statusRow = (root, work, extra = []) =>
  JSON.parse(cli(["status", "--repo", root, "--json", ...extra]).out).works.find((row) => row.work === work);

// A worker written in the test. `result` is what one execution returns, or a
// function of the execution's arguments ({ step, workspacePath, input,
// outputPath, extraEnv, ... }) that returns it; the defaults describe a
// command that ran and exited 0. A reviewer returns { envelope: { findings } }.
export function worker(result = {}, name = "test") {
  return {
    name,
    envMode: "allowlist",
    execute(args) {
      const at = new Date().toISOString();
      return {
        adapter: name,
        command: name,
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        spawnError: null,
        startedAt: at,
        finishedAt: at,
        ...(typeof result === "function" ? result(args) : result),
      };
    },
  };
}

const digestOf = (text) => `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;

// Reviews a commit of a work through the runtime, with the given workers
// (both pass and the reviewer finds nothing unless told otherwise). Returns
// what reviewCommit returns; its `state` is the run's state afterwards.
export function reviewWith(root, work, {
  commit: sha = "HEAD",
  base = null,
  verifier = worker(),
  reviewer = worker({ envelope: { findings: [] } }),
  findings = null,
  checks = {},
  allowedPaths = null,
  runId = null,
  ...more
} = {}) {
  const ref = `delivery/work/${work}/work.md`;
  const resolved = git(root, ["rev-parse", sha]);
  const family = `RUN-${work.replace(/^WORK-/, "")}`;
  return reviewCommit({
    repoRoot: root,
    workId: work,
    runId: runId ?? nextAttemptId(root, work, family),
    base: base ?? git(root, ["log", "-1", "--format=%H", resolved, "--", ref]),
    commit: resolved,
    planDigest: digestOf(readFileSync(join(root, ref), "utf8")),
    adapters: {
      verifier,
      reviewer: findings ? worker({ envelope: { findings } }) : reviewer,
    },
    deliveryChecks: { artifact: "work", requireAcceptance: true, requireIntent: false, maxSeverity: "P2", ...checks },
    allowedPaths,
    ...more,
  });
}

// Commits the files as a change of the work, reviews the commit with workers
// that pass, and approves it. Returns { sha, runId }.
export function approved(root, work, files = { "src/feature.txt": "hello\n" }, { message = `change for ${work}\n\nWork: ${work}`, by = "owner", as = "human", ...options } = {}) {
  const sha = commit(root, message, files);
  const result = reviewWith(root, work, options);
  assert.equal(result.state.run.status, "WAITING_HUMAN", JSON.stringify(result.state.terminal));
  approveReview(root, work, { candidate: sha, by, as });
  return { sha, runId: result.runId };
}
