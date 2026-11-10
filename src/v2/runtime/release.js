// Release readback and closeout. BuildBeat performs no deployment: after a
// person releases an approved commit, the project's own read-only command
// proves the release took effect. Every readback is a line in the work's
// releases.jsonl, next to its decisions, and a work with a release closes
// only on a passing readback (its result page is checked in closeout.js).
// Real cost behind it: one pilot go-live was recorded by hand as forty
// "step N readback" commits.

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { createShellAdapter } from "../adapters/shell.js";
import { actorFrom } from "./actor.js";
import { checkPromotions, readResult } from "./closeout.js";
import { workDeclaresRelease } from "./overview-repos.js";
import { toRepoRef } from "./repo-ref.js";
import { codeCommitsOf } from "./work-commits.js";

const TAIL_LINES = 20;

export class ReleaseError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleaseError";
  }
}

function workDir(repoRoot, workId) {
  return join(repoRoot, "delivery", "work", workId);
}

function readRows(path) {
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function readReleases(repoRoot, workId) {
  return readRows(join(workDir(repoRoot, workId), "releases.jsonl"));
}

function isAncestor(repoRoot, sha, commit) {
  try {
    execFileSync(
      "git",
      ["-C", repoRoot, "merge-base", "--is-ancestor", sha, commit],
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

// An environment name: it goes into the record and into the readback
// command's BUILDBEAT_RELEASE_ENV (WORK-RELEASE-ENVS).
const ENV_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// Runs the configured readback in the main checkout once and records it.
// `runs` are the work's runs (overview's runsFor); the newest approved one
// whose commit the release ref contains is what this readback is about. A
// work that was reviewed needs an approved commit first. A work nobody
// reviewed (done in a session, WORK-RELEASE-ENVS) is bound to its newest
// code commit the release ref contains, found the way status finds COMMITTED
// works; with none, there is nothing to read back. `env` names the
// environment released to: one config serves every environment, and a
// release in steps reads each step back with --note.
export function runReadback({
  repoRoot,
  workId,
  spec,
  redact = [],
  runs,
  ref = "HEAD",
  env = null,
  note = null,
  ts = new Date().toISOString(),
}) {
  if (env !== null && !ENV_NAME.test(env)) {
    throw new ReleaseError(`--env ${env}: an environment name is letters, digits, ".", "_" and "-", starting with a letter or digit`);
  }
  const resolveCommit = (name) =>
    execFileSync(
      "git",
      ["-C", repoRoot, "rev-parse", "--verify", `${name}^{commit}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  let commit;
  try {
    commit = resolveCommit(ref);
  } catch {
    throw new ReleaseError(`--ref ${ref} does not name a commit`);
  }
  // The command runs in the main checkout, which may sit elsewhere than the
  // released ref; both are recorded so neither is claimed for the other.
  const checkout = resolveCommit("HEAD");
  const succeeded = runs
    .filter((run) => run.status === "SUCCEEDED" && run.candidate)
    .sort((a, b) => String(a.lastAt).localeCompare(String(b.lastAt)));
  let released;
  if (succeeded.length === 0 && runs.length > 0) {
    throw new ReleaseError(
      `${workId} has no approved commit; approve its merge decision first`,
    );
  }
  if (succeeded.length === 0) {
    const latest = codeCommitsOf(repoRoot, commit, [workId]).get(workId)?.[0] ?? null;
    if (!latest) {
      throw new ReleaseError(
        `${workId} has no approved commit and no commits in ${ref} trace to it; nothing to read back`,
      );
    }
    released = { id: null, candidate: latest.commit };
  } else {
    released = [...succeeded]
      .reverse()
      .find((run) => isAncestor(repoRoot, run.candidate, commit));
  }
  if (!released) {
    const latest = succeeded.at(-1);
    throw new ReleaseError(
      `candidate ${latest.candidate.slice(0, 7)} (${latest.id}) is not contained in ${ref} (${commit.slice(0, 7)}); merge it first`,
    );
  }

  const adapter = createShellAdapter({
    name: "shell:release",
    command: spec.command,
    args: spec.args ?? [],
    timeoutMs: spec.timeoutMs,
    inheritEnv: spec.inheritEnv === true,
    env: spec.env ?? {},
  });
  // BUILDBEAT_RELEASE_ENV is --env and nothing else: set last, over the
  // config's env: and an inherited host environment, and left out (an
  // undefined value is not passed to the process) when --env is not given,
  // so the command never checks an environment the record does not name.
  const exec = adapter.execute({
    step: "release",
    worker: "release",
    workspacePath: repoRoot,
    input: { workId, run: released.id, candidate: released.candidate, ref, commit, ...(env !== null ? { env } : {}) },
    extraEnv: { BUILDBEAT_RELEASE_ENV: env ?? undefined },
  });
  const scrub = (text) => {
    let out = String(text ?? "");
    for (const pattern of redact) {
      out = out.replace(pattern, "<REDACTED>");
    }
    return out;
  };
  const output = [scrub(exec.stdout), scrub(exec.stderr)]
    .filter((text) => text.length > 0)
    .join("\n");
  const body = [
    `command: ${scrub(exec.command)}`,
    `exitCode: ${exec.exitCode}`,
    `signal: ${exec.signal}`,
    `timedOut: ${exec.timedOut}`,
    `spawnError: ${exec.spawnError}`,
    "--- stdout ---",
    scrub(exec.stdout),
    "--- stderr ---",
    scrub(exec.stderr),
  ].join("\n");
  const logDir = join(repoRoot, ".buildbeat", "runtime", "releases", workId);
  mkdirSync(logDir, { recursive: true });
  // Unique per readback: concurrent readbacks never share a log file.
  const logPath = join(
    logDir,
    `release-${ts.replace(/[^0-9A-Za-z]/g, "")}-${randomUUID().slice(0, 8)}.log`,
  );
  writeFileSync(logPath, body, { encoding: "utf8", flag: "wx" });
  const passed =
    exec.exitCode === 0 && !exec.timedOut && !exec.signal && !exec.spawnError;
  const row = {
    ts,
    work: workId,
    run: released.id,
    candidate: released.candidate,
    ref,
    commit,
    checkout,
    ...(env !== null ? { env } : {}),
    ...(note ? { note } : {}),
    command: scrub(exec.command),
    exitCode: exec.exitCode,
    status: passed ? "passed" : "failed",
    grade: "L4",
    digest: `sha256:${createHash("sha256").update(body, "utf8").digest("hex")}`,
    log: toRepoRef(repoRoot, logPath),
    tail: output.split("\n").filter(Boolean).slice(-TAIL_LINES),
  };
  mkdirSync(workDir(repoRoot, workId), { recursive: true });
  appendFileSync(
    join(workDir(repoRoot, workId), "releases.jsonl"),
    `${JSON.stringify(row)}\n`,
    "utf8",
  );
  return row;
}

// Closes a work: a close-work decision bound to its result page and to the
// conclusions the page says were written into the project. A work with a
// release (a release: key in its own run config, a readback already run, or
// a run config of its own that cannot be read) closes only on a passing
// latest readback; any other work closes once result.md is there. The
// project's run config may name a readback command for every work to use;
// it does not by itself make a work one that has a release.
export function closeWork({
  repoRoot,
  workId,
  result,
  note,
  runs = [],
  by,
  as,
  actor,
  ts = new Date().toISOString(),
}) {
  const decisionsPath = join(workDir(repoRoot, workId), "decisions.jsonl");
  const decisions = readRows(decisionsPath);
  if (decisions.some((row) => row.transition === "close-work")) {
    throw new ReleaseError(`${workId} is already closed`);
  }
  // A live run contradicts a closure (status lets the run win), so a work
  // without a release cannot be closed underneath one of its own runs.
  const live = runs.find((run) => run.status === "RUNNING" || run.status === "WAITING_HUMAN");
  if (live) {
    throw new ReleaseError(
      `${workId} has a run in progress (${live.id} ${live.status}); finish or stop it before closing`,
    );
  }
  // In the order the status hint gives: release and readback first, then
  // the result page.
  const releases = readReleases(repoRoot, workId);
  const released =
    releases.length > 0 || workDeclaresRelease(repoRoot, workId) !== false;
  const latest = released ? releases.at(-1) : null;
  if (released && !latest) {
    throw new ReleaseError(
      `${workId} has no readback; run buildbeat release --repo <path> --work ${workId} after the release first`,
    );
  }
  if (latest && latest.status !== "passed") {
    throw new ReleaseError(
      `the latest readback failed (exit ${latest.exitCode} at ${latest.ts}); fix the release and run buildbeat release again before closing`,
    );
  }
  const page = readResult(repoRoot, workId);
  if (!page.exists) {
    throw new ReleaseError(
      `closing a work needs delivery/work/${workId}/result.md (template: templates/v2/result.example.md)`,
    );
  }
  if (page.draft) {
    throw new ReleaseError(
      `delivery/work/${workId}/result.md is still the generated draft; check it, fill in or delete every "<fill in" line and its first line, then close`,
    );
  }
  const summary =
    typeof result === "string" && result.trim() !== "" ? result.trim() : page.summary;
  if (!summary) {
    throw new ReleaseError("closing a work needs --result <text>");
  }
  // Every line is checked and every problem reported at once.
  const promotions = checkPromotions(repoRoot, workId, page.promotions);
  const problems = promotions.filter((item) => !item.ok).map((item) => item.problem);
  if (problems.length > 0) {
    throw new ReleaseError(problems.join("\n"));
  }
  const who = actorFrom({ actor, by, as, repoRoot });
  const count = existsSync(decisionsPath)
    ? readFileSync(decisionsPath, "utf8").split("\n").filter(Boolean).length
    : 0;
  const row = {
    ts,
    decisionRef: `C-${workId}-${count + 1}`,
    decision: "closed",
    transition: "close-work",
    subject: {
      result: summary,
      resultDigest: page.digest,
      promotions: promotions.map(({ path, commit }) => ({ path, commit })),
      ...(latest
        ? { readback: latest.digest, commit: latest.commit, candidate: latest.candidate }
        : {}),
    },
    ...(typeof note === "string" && note.trim() !== "" ? { note: note.trim() } : {}),
    by: who.id,
    actor: who,
  };
  appendFileSync(decisionsPath, `${JSON.stringify(row)}\n`, "utf8");
  return row;
}

// What runs where (WORK-RELEASE-ENVS): for each environment, the latest
// passing readback across every work in the given checkouts, and the latest
// failing one recorded after it. Readbacks recorded without --env share the
// environment null. This answers "what is deployed" from the records the
// readbacks left, so no project file has to carry it.
export function summarizeReleases(roots) {
  const rows = [];
  for (const repo of roots) {
    const workRoot = join(repo, "delivery", "work");
    let works = [];
    try {
      works = readdirSync(workRoot).filter((name) => statSync(join(workRoot, name)).isDirectory());
    } catch {
      continue;
    }
    for (const work of works) {
      for (const row of readReleases(repo, work)) {
        if (typeof row.ts !== "string" || (row.status !== "passed" && row.status !== "failed")) continue;
        rows.push({ ...row, work: row.work ?? work, repo });
      }
    }
  }
  const byEnv = new Map();
  for (const row of rows) {
    const env = typeof row.env === "string" && row.env ? row.env : null;
    if (!byEnv.has(env)) byEnv.set(env, []);
    byEnv.get(env).push(row);
  }
  const summary = [];
  for (const [env, list] of byEnv) {
    list.sort((a, b) => a.ts.localeCompare(b.ts));
    const passed = list.filter((row) => row.status === "passed").at(-1) ?? null;
    const failed = list.filter((row) => row.status === "failed" && (!passed || row.ts > passed.ts)).at(-1) ?? null;
    summary.push({
      env,
      work: passed?.work ?? null,
      repo: passed?.repo ?? null,
      commit: passed?.commit ?? null,
      candidate: passed?.candidate ?? null,
      run: passed?.run ?? null,
      at: passed?.ts ?? null,
      note: passed?.note ?? null,
      laterFailure: failed ? { work: failed.work, at: failed.ts, exitCode: failed.exitCode ?? null } : null,
    });
  }
  return summary.sort((a, b) => (a.env === null) - (b.env === null) || String(a.env).localeCompare(String(b.env)));
}

export function renderReleases(summary) {
  if (summary.length === 0) {
    return "releases: none recorded (buildbeat release --config <run-config.yaml> --env <name>)";
  }
  const width = Math.max(...summary.map((item) => (item.env ?? "-").length));
  const lines = ["releases (latest passing readback per environment):"];
  for (const item of summary) {
    const env = (item.env ?? "-").padEnd(width);
    const later = item.laterFailure
      ? ` · ${item.commit ? "later" : "latest"} readback failed @ ${item.laterFailure.at} (${item.laterFailure.work}, exit ${item.laterFailure.exitCode})`
      : "";
    const head = item.commit
      ? `${item.work}  ${item.commit.slice(0, 7)} @ ${item.at}${item.note ? ` — ${item.note}` : ""}`
      : "no passing readback";
    lines.push(`  ${env}  ${head}${later}${item.env === null ? "   (recorded without --env)" : ""}`);
  }
  return lines.join("\n");
}
