// Workspace manager per docs/v2/RFC-0002-domain-model.md: every Run works in
// an isolated git worktree; the candidate is whatever git reads back, never
// what a worker claims. Locks are mkdir-atomic. Run branches are never
// deleted here — the pinned candidate must stay reachable for evidence.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export class WorkspaceError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkspaceError";
  }
}

function git(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : error.message;
    throw new WorkspaceError(`git ${args.join(" ")} failed: ${stderr}`);
  }
}

export function acquireLock(repoRoot, runId) {
  const lockDir = join(repoRoot, ".buildbeat", "runtime", "locks");
  mkdirSync(lockDir, { recursive: true });
  const lockPath = join(lockDir, `${runId}.lock`);
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new WorkspaceError(`run ${runId} is already locked (${lockPath})`);
    }
    throw error;
  }
  return lockPath;
}

export function releaseLock(repoRoot, runId) {
  const lockPath = join(repoRoot, ".buildbeat", "runtime", "locks", `${runId}.lock`);
  rmSync(lockPath, { recursive: true, force: true });
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
  const committed = git(worktreePath, ["diff", "--name-only", `${base}..HEAD`])
    .split("\n")
    .filter(Boolean);
  const dirty = git(worktreePath, ["status", "--porcelain"])
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
