// Read-only repository/config discovery shared by single- and multi-repo status.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseYamlSubset } from "../engine/yaml-subset.js";

export const pathLabel = (cwd, path) => relative(cwd, path) || ".";
export const shellArg = (value) => /^[a-zA-Z0-9_./:-]+$/.test(value)
  ? value : `'${value.replaceAll("'", "'\\''")}'`;
export const directory = (path) => {
  try { return statSync(path).isDirectory(); } catch { return false; }
};

// Require an actual checkout root, not a directory inside a parent checkout.
export function repositoryRoot(path, cache = new Map()) {
  const real = realpathSync(path);
  if (cache.has(real)) {
    const cached = cache.get(real);
    if (cached instanceof Error) throw cached;
    return cached;
  }
  try {
    const top = execFileSync("git", ["-C", real, "rev-parse", "--show-toplevel"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (realpathSync(top) !== real) throw new Error("not a git repository root");
    cache.set(real, real);
    return real;
  } catch (error) {
    cache.set(real, error);
    throw error;
  }
}

export function workConfigs(repoRoot, workId, warnings = []) {
  const dir = join(repoRoot, "delivery", "work", workId);
  if (!directory(dir)) return [];
  return readdirSync(dir).sort().filter((name) => /^run-config.*\.ya?ml$/.test(name)).map((name) => {
    const path = join(dir, name);
    try {
      const doc = parseYamlSubset(readFileSync(path, "utf8"));
      if (typeof doc.repo !== "string" || !doc.repo.trim()) throw new Error("repo must be a non-empty path");
      const target = resolve(dirname(path), doc.repo);
      return { path, target, release: Object.hasOwn(doc, "release") };
    } catch (error) {
      warnings.push(`${path}: ${error.message.replaceAll("\n", " ")}`);
      return { path, error: true, release: null };
    }
  });
}

export function configTargets(configs, warnings, roots = new Map()) {
  return configs.map((config) => {
    if (!config.target) return config;
    try { return { ...config, repo: repositoryRoot(config.target, roots) }; }
    catch (error) {
      warnings.push(`${config.path}: ${config.target}: ${error.message.replaceAll("\n", " ")}`);
      return { ...config, error: true };
    }
  });
}

// The checkout that contains path (its root or any directory inside it).
function enclosingCheckout(path) {
  try {
    const top = execFileSync("git", ["-C", path, "rev-parse", "--show-toplevel"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return top ? realpathSync(top) : null;
  } catch {
    return null;
  }
}

// Run configs that govern a work kept in this checkout: its own, and those a
// main repository keeps for it with repo: pointing here, looked up in the
// caller's checkout and in the checkout this one sits inside (the layouts
// status follows). An unreadable config there counts too, so a release
// cannot be skipped because its config could not be read.
export function governingConfigs(repoRoot, workId, { callers = [], warnings = [] } = {}) {
  const real = realpathSync(repoRoot);
  const configs = workConfigs(real, workId, warnings);
  const roots = new Set();
  for (const path of [...callers, dirname(real)]) {
    const root = path ? enclosingCheckout(path) : null;
    if (root && root !== real) roots.add(root);
  }
  for (const root of roots) {
    for (const config of configTargets(workConfigs(root, workId, warnings), warnings)) {
      if (config.error || config.repo === real) configs.push(config);
    }
  }
  return configs;
}

// The warning to print when a work's records would stay out of Git (a
// .gitignore rule or .git/info/exclude), or null. Records that never reach
// Git cannot be found from another machine or by another person; in a pilot
// workspace all five code repositories excluded delivery/ this way.
export function ignoredRecordsWarning(repoRoot, workId) {
  try {
    execFileSync("git", ["-C", repoRoot, "check-ignore", "-q", "--no-index", `delivery/work/${workId}/work.md`], {
      stdio: "ignore",
    });
  } catch {
    return null;
  }
  return `warning: delivery/work/${workId}/ is ignored by Git here (.gitignore or .git/info/exclude); its records will not travel with the code`;
}

// The warning to print when a work's folder holds files that the next commit
// would add to Git and that would stay in its history for good: screenshots,
// archives and logs (the template's gitignore keeps them on this machine) or
// anything of 256 KB or more. Files already in Git are left alone (deleting
// them would not shrink history), and so are ignored ones. In a pilot
// workspace the main repository's history reached 36 MB in two months,
// nearly all evidence screenshots, while five code repositories' text
// records came to 0.85 MB (WORK-DELIVERY-BINARIES).
const HEAVY_EXTENSIONS = /\.(png|jpe?g|gif|webp|zip|tgz|gz|log)$/i;
const HEAVY_BYTES = 256 * 1024;
const HEAVY_LISTED = 5;

function sizeLabel(bytes) {
  const kb = Math.max(1, Math.ceil(bytes / 1024));
  return kb >= 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${kb} KB`;
}

export function heavyRecordsWarning(repoRoot, workId) {
  const folder = `delivery/work/${workId}/`;
  let listed;
  try {
    listed = execFileSync("git", ["-C", repoRoot, "ls-files", "--others", "--exclude-standard", "-z", "--", folder], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
  const heavy = [];
  for (const path of listed.split("\0").filter(Boolean).sort()) {
    let size;
    try {
      const stat = statSync(join(repoRoot, path));
      if (!stat.isFile()) continue;
      size = stat.size;
    } catch {
      continue;
    }
    if (HEAVY_EXTENSIONS.test(path) || size >= HEAVY_BYTES) {
      heavy.push(`${path.slice(folder.length)} (${sizeLabel(size)})`);
    }
  }
  if (heavy.length === 0) return null;
  const shown = heavy.slice(0, HEAVY_LISTED);
  const more = heavy.length > HEAVY_LISTED ? `, and ${heavy.length - HEAVY_LISTED} more` : "";
  return `warning: ${folder} has ${heavy.length} file(s) that would go into Git and stay in its history for good: ${shown.join(", ")}${more}; keep screenshots, archives and logs on this machine (see templates/gitignore.template)`;
}

export function discoverRepos(repoRoot, warnings, roots = new Map()) {
  const repos = new Set([repoRoot]);
  const workRoot = join(repoRoot, "delivery", "work");
  if (directory(workRoot)) {
    for (const id of readdirSync(workRoot).sort()) {
      for (const config of configTargets(workConfigs(repoRoot, id, warnings), warnings, roots)) {
        if (config.repo) repos.add(config.repo);
      }
    }
  }
  for (const name of readdirSync(repoRoot).sort()) {
    const child = join(repoRoot, name);
    if (!directory(join(child, "delivery", "work"))) continue;
    try { repos.add(repositoryRoot(child, roots)); } catch { /* only discover git roots */ }
  }
  return [...repos];
}
