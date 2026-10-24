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
