// Workspace manager per docs/v2/RFC-0002-domain-model.md: every Run works in
// an isolated git worktree; the candidate is whatever git reads back, never
// what a worker claims. Locks are mkdir-atomic and record their owner, so a
// lock whose owner process is provably gone can be reclaimed. Run branches
// are never deleted here — the pinned candidate must stay reachable for
// evidence.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

export class WorkspaceError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "WorkspaceError";
    Object.assign(this, details);
  }
}

function git(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    // Preserve porcelain's fixed-width leading status columns. Trimming the
    // first leading space turns " M file" into "M file" and makes the
    // downstream slice(3) drop the first path character.
    }).trimEnd();
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : error.message;
    throw new WorkspaceError(`git ${args.join(" ")} failed: ${stderr}`);
  }
}

// Lock ownership. A driver killed by SIGKILL, a host-tool timeout or a
// reboot never reaches its finally block, so its locks outlive it. Real
// incident: a killed driver left active-run.lock and <RUN>.lock behind;
// resume answered "another run is active" and stop "already locked", and the
// only way out was deleting runtime directories by hand.
const OWNER_FILE = "owner.json";
const CLAIM_SLOTS = 16;
// A claim with no readable claimer is only the instant between creating it
// and writing it; older than this, its writer died in that instant.
const UNREADABLE_CLAIM_MS = 10_000;

function lockPathFor(repoRoot, id) {
  return join(repoRoot, ".buildbeat", "runtime", "locks", `${id}.lock`);
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return error.code === "EPERM";
  }
}

function readOwner(lockPath) {
  try {
    const owner = JSON.parse(readFileSync(join(lockPath, OWNER_FILE), "utf8"));
    if (owner && Number.isInteger(owner.pid) && owner.pid > 0 && typeof owner.host === "string") {
      return owner;
    }
  } catch {
    // missing or unreadable: no owner record
  }
  return null;
}

function sameOwner(a, b) {
  return a.pid === b.pid && a.host === b.host && a.acquiredAt === b.acquiredAt;
}

export function describeLockOwner(owner) {
  return `pid ${owner.pid} on ${owner.host}, acquired ${owner.acquiredAt}${owner.command ? `, command ${owner.command}` : ""}`;
}

// alive | dead | foreign-host | unknown. Only "dead" is ever reclaimed: a
// foreign host cannot be probed, and a lock with no owner record may belong
// to an older buildbeat that is still running.
export function inspectLock(lockPath, { host = hostname(), isAlive = pidAlive } = {}) {
  const owner = readOwner(lockPath);
  if (!owner) {
    return { state: "unknown", owner: null };
  }
  if (owner.host !== host) {
    return { state: "foreign-host", owner };
  }
  return { state: isAlive(owner.pid) ? "alive" : "dead", owner };
}

function ownerRecord() {
  return {
    pid: process.pid,
    host: hostname(),
    acquiredAt: new Date().toISOString(),
    command: process.argv[2] ?? null,
  };
}

// Readers never see a half-written owner: write aside, then rename over.
function writeOwner(lockPath) {
  const temp = join(lockPath, `.${OWNER_FILE}.${process.pid}-${randomBytes(4).toString("hex")}`);
  writeFileSync(temp, `${JSON.stringify(ownerRecord())}\n`);
  renameSync(temp, join(lockPath, OWNER_FILE));
}

function takeLock(lockPath) {
  mkdirSync(lockPath);
  try {
    writeOwner(lockPath);
  } catch (error) {
    rmSync(lockPath, { recursive: true, force: true });
    throw error;
  }
}

function ownerGeneration(owner) {
  return createHash("sha256").update(`${owner.pid}|${owner.host}|${owner.acquiredAt}`).digest("hex").slice(0, 16);
}

function claimAbandoned(claimPath, isAlive) {
  try {
    const claimer = JSON.parse(readFileSync(claimPath, "utf8"));
    return claimer.host === hostname() && !isAlive(claimer.pid);
  } catch {
    try {
      return Date.now() - statSync(claimPath).mtimeMs > UNREADABLE_CLAIM_MS;
    } catch {
      return false;
    }
  }
}

// Wins the right to take over a lock whose owner was judged dead, or
// returns false. The lock directory never disappears during a takeover, so
// a plain acquire always sees it held and cannot slip in between (the
// review of the first version found exactly that window: renaming the lock
// aside let a third process take a fresh one). Reclaimers race on a claim
// file created with O_EXCL and named after the dead owner's generation:
// exactly one wins per generation. A winner that died before finishing
// leaves its claim behind; the next slot is tried once that claimer is
// provably gone. After winning, the owner record is re-read: if it is no
// longer the dead owner, nothing is taken over.
export function reclaimStaleLock(lockPath, expectedOwner, { isAlive = pidAlive } = {}) {
  const generation = ownerGeneration(expectedOwner);
  for (let slot = 1; slot <= CLAIM_SLOTS; slot += 1) {
    const claimPath = join(lockPath, `claim-${generation}-${slot}`);
    try {
      writeFileSync(claimPath, JSON.stringify({ pid: process.pid, host: hostname() }), { flag: "wx" });
    } catch (error) {
      if (error.code === "ENOENT") {
        return false;
      }
      if (error.code !== "EEXIST") {
        throw error;
      }
      if (claimAbandoned(claimPath, isAlive)) {
        continue;
      }
      return false;
    }
    const current = readOwner(lockPath);
    return Boolean(current && sameOwner(current, expectedOwner));
  }
  return false;
}

function heldError(id, seen) {
  const where = `.buildbeat/runtime/locks/${id}.lock`;
  let detail;
  if (seen.state === "alive") {
    detail = `held by ${describeLockOwner(seen.owner)}; that process is still running: wait for it, or end it once you are sure it is stuck`;
  } else if (seen.state === "dead") {
    detail = `held by ${describeLockOwner(seen.owner)}, whose process is gone; another process is taking it over right now: retry in a moment`;
  } else if (seen.state === "foreign-host") {
    detail = `held by ${describeLockOwner(seen.owner)}, another host; release it there`;
  } else {
    detail = `no owner record in ${where} (a lock from an older buildbeat, or a crash while taking it); check that no buildbeat process is still running, then remove that directory`;
  }
  return new WorkspaceError(`run ${id} is already locked: ${detail}`, { lock: { id, ...seen, detail } });
}

export function acquireLock(repoRoot, runId) {
  mkdirSync(join(repoRoot, ".buildbeat", "runtime", "locks"), { recursive: true });
  const lockPath = lockPathFor(repoRoot, runId);
  try {
    takeLock(lockPath);
    return lockPath;
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
  const seen = inspectLock(lockPath);
  if (seen.state !== "dead" || !reclaimStaleLock(lockPath, seen.owner)) {
    throw heldError(runId, seen.state === "dead" ? inspectLock(lockPath) : seen);
  }
  writeOwner(lockPath);
  process.stderr.write(`reclaimed stale lock ${runId} (owner ${describeLockOwner(seen.owner)} is gone)\n`);
  return lockPath;
}

// Run ids currently holding a lock in this repository (the repository-wide
// active-run marker excluded): who a blocked `start` is queued behind.
export function listHeldRunLocks(repoRoot) {
  const lockDir = join(repoRoot, ".buildbeat", "runtime", "locks");
  if (!existsSync(lockDir)) {
    return [];
  }
  return readdirSync(lockDir)
    .filter((entry) => entry.endsWith(".lock") && entry !== "active-run.lock")
    .map((entry) => entry.slice(0, -".lock".length))
    .sort();
}

export function releaseLock(repoRoot, runId) {
  rmSync(lockPathFor(repoRoot, runId), { recursive: true, force: true });
}

export function createWorkspace({ repoRoot, runId, base, branch, protectPush = true }) {
  const resolvedBase = git(repoRoot, ["rev-parse", "--verify", `${base}^{commit}`]);
  const worktreePath = join(repoRoot, ".buildbeat", "worktrees", runId);
  if (existsSync(worktreePath)) {
    throw new WorkspaceError(`worktree already exists: ${worktreePath}`);
  }
  const branchName = branch ?? `run/${runId}`;
  const branches = git(repoRoot, ["branch", "--list", branchName]);
  if (branches !== "") {
    throw new WorkspaceError(`branch already exists: ${branchName}`);
  }
  git(repoRoot, ["worktree", "add", "-b", branchName, worktreePath, resolvedBase]);

  // Protected Actions (B WP4.4): the reliable form of "workers must not
  // push" is capability removal, not a prompt. Worktree-scoped pushurl
  // overrides make any push from inside the workspace fail while the main
  // checkout keeps its remotes untouched.
  let protectedRemotes = [];
  if (protectPush) {
    const remotes = git(repoRoot, ["remote"]).split("\n").filter(Boolean);
    if (remotes.length > 0) {
      git(repoRoot, ["config", "extensions.worktreeConfig", "true"]);
      for (const remote of remotes) {
        git(worktreePath, [
          "config",
          "--worktree",
          `remote.${remote}.pushurl`,
          "protected://push-blocked-by-buildbeat",
        ]);
      }
      protectedRemotes = remotes;
    }
  }
  return {
    workspaceId: runId,
    repoRoot,
    worktreePath,
    branch: branchName,
    base: resolvedBase,
    protectedRemotes,
  };
}

export function readback(worktreePath) {
  const head = git(worktreePath, ["rev-parse", "HEAD"]);
  const status = git(worktreePath, ["status", "--porcelain"]);
  return { head, dirty: status !== "" };
}

// Paths changed relative to base: committed diff plus anything dirty in the
// tree. Rename lines keep only the new path.
export function listChangedPaths(worktreePath, base) {
  // core.quotepath=off: git otherwise octal-escapes and quotes non-ASCII
  // paths, which would defeat the allowedPaths prefix check (real incident:
  // a Chinese board filename was reported as out of scope).
  const committed = git(worktreePath, [
    "-c",
    "core.quotepath=off",
    "diff",
    "--name-only",
    `${base}..HEAD`,
  ])
    .split("\n")
    .filter(Boolean);
  const dirty = git(worktreePath, ["-c", "core.quotepath=off", "status", "--porcelain"])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const path = line.slice(3);
      return path.includes(" -> ") ? path.split(" -> ")[1] : path;
    });
  return [...new Set([...committed, ...dirty])];
}

export function pinCandidate(workspace) {
  const { head, dirty } = readback(workspace.worktreePath);
  if (dirty) {
    throw new WorkspaceError(
      `worktree is dirty; a candidate must be a committed state (${workspace.worktreePath})`,
    );
  }
  return head;
}

export function removeWorkspace(workspace, { force = false } = {}) {
  const { dirty } = readback(workspace.worktreePath);
  if (dirty && !force) {
    throw new WorkspaceError(
      `refusing to remove dirty worktree ${workspace.worktreePath}; debug state is preserved`,
    );
  }
  const args = ["worktree", "remove"];
  if (force) {
    args.push("--force");
  }
  args.push(workspace.worktreePath);
  git(workspace.repoRoot, args);
}
