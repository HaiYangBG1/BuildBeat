// Runtime garbage collection (iteration 08, C3): terminal runs leave a
// worktree, a run/* branch and sometimes a lock behind. Sixteen of them had
// piled up in the deploy campaign before the owner asked for "打扫卫生".
//
// Rules (fail-closed toward keeping things):
//   - only terminal AND compacted runs are candidates; a run-record in the Git
//     plane must exist before anything in the runtime plane goes;
//   - the worktree is removable (commits live on the branch);
//   - the branch goes only when its candidate is reachable from some other
//     ref (merged, tagged, on a remote) or the run produced no candidate;
//     otherwise the branch is the only thing keeping evidence reachable and
//     stays, listed as such;
//   - a dirty worktree is never removed without --force.
// The ledger is not touched: after RUN_COMPACTED nothing may be appended.

import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { EventLedger } from "../storage/event-ledger.js";
import { readback } from "../workspace/workspace-manager.js";
import { resolveRepoRef } from "./repo-ref.js";

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

function branchExists(repoRoot, branch) {
  try {
    git(repoRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

function worktreeRegistered(repoRoot, worktreePath) {
  try {
    const listing = git(repoRoot, ["worktree", "list", "--porcelain"]);
    return listing.split("\n").some((line) => line === `worktree ${worktreePath}`);
  } catch {
    return false;
  }
}

// Refs (other than the run's own branch and other run/* branches) that
// already contain the candidate commit.
function otherRefsContaining(repoRoot, sha, ownBranch) {
  try {
    const out = git(repoRoot, ["for-each-ref", "--contains", sha, "--format=%(refname)"]);
    return out
      .split("\n")
      .filter(Boolean)
      .filter((ref) => ref !== `refs/heads/${ownBranch}` && !ref.startsWith("refs/heads/run/"));
  } catch {
    return [];
  }
}

export function planGc(repoRoot) {
  const runsDir = join(repoRoot, ".buildbeat", "runtime", "runs");
  const locksDir = join(repoRoot, ".buildbeat", "runtime", "locks");
  const rows = [];
  if (!existsSync(runsDir)) {
    return rows;
  }
  for (const entry of readdirSync(runsDir).sort()) {
    const ledgerPath = join(runsDir, entry, "events.jsonl");
    if (!existsSync(ledgerPath)) {
      continue;
    }
    const ledger = EventLedger.open(ledgerPath);
    const state = ledger.state;
    const row = { run: entry, status: state.run?.status ?? "(no run)", actions: [], keep: [] };
    rows.push(row);
    if (ledger.corruption) {
      row.keep.push(`ledger corrupted after seq=${ledger.corruption.afterSeq}; human decision required`);
      continue;
    }
    if (!state.run) {
      row.keep.push("ledger has no run");
      continue;
    }
    if (!state.terminal) {
      row.keep.push(`run not terminal (${state.run.status})`);
      continue;
    }
    if (!state.compacted) {
      row.keep.push("terminal but not compacted (no run-record in the Git plane)");
      continue;
    }
    const lockPath = join(locksDir, `${entry}.lock`);
    if (existsSync(lockPath)) {
      row.actions.push({ kind: "remove-lock", path: lockPath });
    }
    const workspace = state.workspaces[entry];
    if (!workspace) {
      continue;
    }
    const worktreePath = resolveRepoRef(repoRoot, workspace.worktreePath);
    const registered = worktreeRegistered(repoRoot, worktreePath);
    const present = existsSync(worktreePath);
    row.candidate = workspace.candidate;
    row.branch = workspace.branch;
    if (present || registered) {
      let dirty = false;
      if (present) {
        try {
          dirty = readback(worktreePath).dirty;
        } catch {
          dirty = false;
        }
      }
      row.actions.push({ kind: "remove-worktree", path: worktreePath, dirty, registered, present });
    }
    if (workspace.branch && branchExists(repoRoot, workspace.branch)) {
      if (!workspace.candidate) {
        row.actions.push({ kind: "delete-branch", branch: workspace.branch, reason: "run produced no candidate" });
      } else {
        const elsewhere = otherRefsContaining(repoRoot, workspace.candidate, workspace.branch);
        if (elsewhere.length > 0) {
          row.actions.push({
            kind: "delete-branch",
            branch: workspace.branch,
            reason: `candidate ${workspace.candidate.slice(0, 7)} also on ${elsewhere.slice(0, 3).join(", ")}`,
          });
        } else {
          row.keep.push(
            `branch ${workspace.branch} kept: candidate ${workspace.candidate.slice(0, 7)} is reachable only there (evidence)`,
          );
        }
      }
    }
  }
  return rows;
}

export function applyGc(repoRoot, rows, { force = false } = {}) {
  const results = [];
  for (const row of rows) {
    for (const action of row.actions) {
      const result = { run: row.run, ...action, done: false, error: null };
      results.push(result);
      try {
        if (action.kind === "remove-lock") {
          rmSync(action.path, { recursive: true, force: true });
          result.done = true;
        } else if (action.kind === "remove-worktree") {
          if (action.dirty && !force) {
            result.error = "worktree dirty; rerun with --force true to discard";
            continue;
          }
          if (action.registered) {
            const args = ["worktree", "remove"];
            if (force || action.dirty) {
              args.push("--force");
            }
            args.push(action.path);
            git(repoRoot, args);
          } else if (action.present) {
            rmSync(action.path, { recursive: true, force: true });
          }
          try {
            git(repoRoot, ["worktree", "prune"]);
          } catch {
            // prune is best-effort
          }
          result.done = true;
        } else if (action.kind === "delete-branch") {
          git(repoRoot, ["branch", "-D", action.branch]);
          result.done = true;
        }
      } catch (error) {
        result.error = error.stderr ? String(error.stderr).trim() : error.message;
      }
    }
  }
  return results;
}
