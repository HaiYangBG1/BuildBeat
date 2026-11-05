// Work: trailers without remembering them (WORK-COMMIT-TRAILERS). The
// shipped commit-msg hook (templates/v2/hooks/commit-msg) adds the trailer
// when a commit's subject, or its branch name, names exactly one work that
// has a folder; `buildbeat hooks install` puts it where Git runs hooks, and
// accept / check say when recent commits name a work in the subject but
// carry no trailer. Real cost behind it: in a pilot repository none of
// about 400 code commits in three weeks carried a Work: trailer, while
// nearly every subject named its work.

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";

import { knownWorks, namedWork } from "./work-commits.js";

export const HOOK_TEMPLATE = fileURLToPath(new URL("../../../templates/v2/hooks/commit-msg", import.meta.url));
const HOOK_MARK = "BuildBeat commit-msg hook";
const RECENT = 50;

export class HookError extends Error {
  constructor(message) {
    super(message);
    this.name = "HookError";
  }
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

// Where Git runs hooks for this checkout: core.hooksPath when set, else the
// common .git/hooks shared by every linked worktree.
export function hooksDir(repoRoot) {
  return resolve(repoRoot, git(repoRoot, ["rev-parse", "--git-path", "hooks"]));
}

function ours(path) {
  try {
    return readFileSync(path, "utf8").includes(HOOK_MARK);
  } catch {
    return false;
  }
}

// Installed means Git will run it: commit-msg is ours, or a project's own
// commit-msg calls the copy saved beside it. A saved copy nothing calls
// adds no trailer, so it does not count.
export function hookInstalled(repoRoot) {
  try {
    const dir = hooksDir(repoRoot);
    const main = resolve(dir, "commit-msg");
    if (ours(main)) return true;
    return ours(resolve(dir, "buildbeat-commit-msg")) && readFileSync(main, "utf8").includes("buildbeat-commit-msg");
  } catch {
    return false;
  }
}

function inside(path, dir) {
  const rel = relative(dir, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// Installs the hook and says what was done. A hooks directory inside the
// working tree belongs to the project and goes into Git with it: nothing is
// written there. An
// existing commit-msg hook that is not ours is never touched.
export function installCommitHook(repoRoot) {
  const top = realpathSync(git(repoRoot, ["rev-parse", "--show-toplevel"]));
  const gitDir = realpathSync(resolve(repoRoot, git(repoRoot, ["rev-parse", "--git-common-dir"])));
  const dir = hooksDir(repoRoot);
  const real = existsSync(dir) ? realpathSync(dir) : dir;
  if (inside(real, top) && !inside(real, gitDir)) {
    return {
      written: null,
      message: `${dir} is tracked by Git, so nothing was written; copy templates/v2/hooks/commit-msg there as commit-msg (or call it from your existing hook) and commit it with the project's own review`,
    };
  }
  const text = readFileSync(HOOK_TEMPLATE, "utf8");
  mkdirSync(dir, { recursive: true });
  const main = resolve(dir, "commit-msg");
  if (existsSync(main) && !ours(main)) {
    const side = resolve(dir, "buildbeat-commit-msg");
    writeFileSync(side, text);
    chmodSync(side, 0o755);
    return {
      written: side,
      message: `${main} already exists, left as is; saved the BuildBeat hook as ${side}; add this line to your commit-msg hook: sh "${side}" "$1"`,
    };
  }
  writeFileSync(main, text);
  chmodSync(main, 0o755);
  return {
    written: main,
    message: `installed ${main}: a commit whose subject (or branch name) names exactly one work under delivery/work/ gets a "Work: <ID>" trailer`,
  };
}

// The warning accept and check print when recent commits on HEAD name one
// work in the subject but carry no Work: trailer and the hook is not
// installed, or null.
export function trailerWarning(repoRoot, repoLabel) {
  if (hookInstalled(repoRoot)) return null;
  const known = knownWorks(repoRoot);
  if (known.size === 0) return null;
  let out;
  let branch;
  try {
    out = execFileSync("git", [
      "-C", repoRoot, "-c", "log.showSignature=false", "log", `-${RECENT}`,
      "--format=%x00%s%x00%(trailers:key=Work,valueonly,separator=%x1d)", "HEAD", "--",
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    branch = git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]) || "HEAD";
  } catch {
    return null;
  }
  const fields = out.split("\0");
  let count = 0;
  for (let at = 1; at + 1 < fields.length; at += 2) {
    const subject = fields[at];
    const trailers = fields[at + 1].trim();
    if (!trailers && namedWork(subject, known)) count += 1;
  }
  if (count === 0) return null;
  return `warning: ${count} of the last ${RECENT} commits on ${branch} name a work in the subject but carry no Work: trailer; buildbeat hooks install --repo ${repoLabel} adds the trailer from now on`;
}
