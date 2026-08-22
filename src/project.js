import {
  accessSync,
  constants as fsConstants,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  IGNORED_SCAN_DIRECTORIES,
  MANIFEST_PATH,
  RENDER_REQUIRED_PLACEHOLDERS,
  SCRIPT_NAMES,
  filePolicy,
} from "./constants.js";

const TEMPLATE_ROOT = fileURLToPath(new URL("../templates/", import.meta.url));
const MAX_SCAN_DEPTH = 4;
const MAX_SCAN_ENTRIES = 5000;
const TEXT_LIMIT_BYTES = 512 * 1024;

function posixPath(value) {
  return value.split(path.sep).join("/");
}

function safeReadText(filename) {
  try {
    const stat = lstatSync(filename);
    if (!stat.isFile() || stat.size > TEXT_LIMIT_BYTES) {
      return null;
    }
    return readFileSync(filename, "utf8");
  } catch {
    return null;
  }
}

function safeLabel(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function walk(root, { maxDepth = MAX_SCAN_DEPTH, ignore = true } = {}) {
  const files = [];
  const directories = [];
  const symlinks = [];
  const warnings = [];
  let entriesSeen = 0;
  let truncated = false;

  function visit(current, relative, depth) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    } catch (error) {
      warnings.push({ path: posixPath(relative || "."), reason: error.code || "unreadable" });
      return;
    }

    for (const entry of entries) {
      entriesSeen += 1;
      if (entriesSeen > MAX_SCAN_ENTRIES) {
        truncated = true;
        return;
      }

      const childRelative = relative ? path.join(relative, entry.name) : entry.name;
      const normalized = posixPath(childRelative);
      const child = path.join(current, entry.name);

      if (entry.isSymbolicLink()) {
        symlinks.push(normalized);
        continue;
      }
      if (entry.isDirectory()) {
        directories.push(normalized);
        if (depth >= maxDepth) {
          continue;
        }
        if (ignore && IGNORED_SCAN_DIRECTORIES.has(entry.name)) {
          continue;
        }
        visit(child, childRelative, depth + 1);
      } else if (entry.isFile()) {
        files.push(normalized);
      }
    }
  }

  visit(root, "", 0);
  return { directories, files, symlinks, warnings, entriesSeen, truncated };
}

export function listTemplateFiles() {
  return walk(TEMPLATE_ROOT, { maxDepth: 12, ignore: false }).files;
}

export function templateTarget(templatePath, layout) {
  if (templatePath === "gitignore.template") {
    return ".gitignore";
  }
  if (layout === "compact") {
    if (templatePath.startsWith("scripts/")) {
      return `pm/${templatePath}`;
    }
    if (templatePath === "SOLOBATON.md" || templatePath === "指挥台.md") {
      return `pm/${templatePath}`;
    }
  }
  return templatePath;
}

export function plannedFiles(layout) {
  return listTemplateFiles().map((templatePath) => ({
    template: templatePath,
    target: templateTarget(templatePath, layout),
    policy: filePolicy(templatePath),
  }));
}

function detectPlaceholders(target, layout) {
  const findings = [];
  for (const item of plannedFiles(layout)) {
    const requiredTokens = RENDER_REQUIRED_PLACEHOLDERS[item.template] || [];
    if (requiredTokens.length === 0) {
      continue;
    }
    const text = safeReadText(path.join(target, item.target));
    if (text === null) {
      continue;
    }
    const tokens = requiredTokens.filter((token) => text.includes(token));
    if (tokens.length > 0) {
      findings.push({ path: item.target, tokens });
    }
  }
  return findings;
}

function parseVersion(markerPath) {
  const text = safeReadText(markerPath);
  if (text === null) {
    return null;
  }
  const match = text.match(/本项目使用 Solobaton `(v\d+\.\d+(?:\.\d+)?)`/);
  return match ? match[1] : null;
}

function detectInstallation(target) {
  const defaultMarker = path.join(target, "SOLOBATON.md");
  const compactMarker = path.join(target, "pm", "SOLOBATON.md");
  const defaultEvidence =
    existsSync(defaultMarker) || existsSync(path.join(target, "scripts", "bus-check.sh"));
  const compactEvidence =
    existsSync(compactMarker) || existsSync(path.join(target, "pm", "scripts", "bus-check.sh"));

  if (defaultEvidence && compactEvidence) {
    return { state: "mixed", layout: null, version: null };
  }
  if (existsSync(defaultMarker)) {
    return { state: "installed", layout: "default", version: parseVersion(defaultMarker) };
  }
  if (existsSync(compactMarker)) {
    return { state: "installed", layout: "compact", version: parseVersion(compactMarker) };
  }
  if (defaultEvidence) {
    return { state: "partial", layout: "default", version: null };
  }
  if (compactEvidence) {
    return { state: "partial", layout: "compact", version: null };
  }
  return { state: "not-installed", layout: null, version: null };
}

function inspectManifest(target) {
  const filename = path.join(target, MANIFEST_PATH);
  if (!existsSync(filename)) {
    return { state: "missing", path: MANIFEST_PATH };
  }
  const text = safeReadText(filename);
  if (text === null) {
    return { state: "invalid", path: MANIFEST_PATH, reason: "unreadable" };
  }
  try {
    const data = JSON.parse(text);
    return {
      state: "present",
      path: MANIFEST_PATH,
      schemaVersion: Number.isInteger(data.schemaVersion) ? data.schemaVersion : null,
      scaffoldVersion:
        typeof data.scaffoldVersion === "string" ? safeLabel(data.scaffoldVersion).slice(0, 40) : null,
      cliVersion: typeof data.cliVersion === "string" ? safeLabel(data.cliVersion).slice(0, 40) : null,
      layout: typeof data.layout === "string" ? safeLabel(data.layout).slice(0, 40) : null,
      hasFiles: Boolean(data.files) && typeof data.files === "object" && !Array.isArray(data.files),
      hasIntegrations:
        Boolean(data.integrations) &&
        typeof data.integrations === "object" &&
        !Array.isArray(data.integrations),
    };
  } catch {
    return { state: "invalid", path: MANIFEST_PATH, reason: "invalid-json" };
  }
}

function commandVersion(command, args = ["--version"]) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    timeout: 3000,
  });
  if (result.error || result.status !== 0) {
    return { available: false, version: null };
  }
  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  return { available: true, version: output.split(/\r?\n/, 1)[0] || null };
}

let dependencyCache = null;

function dependencyStatus() {
  if (dependencyCache !== null) {
    return dependencyCache;
  }
  dependencyCache = {
    bash: commandVersion("bash"),
    git: commandVersion("git"),
    gitleaks: commandVersion("gitleaks", ["version"]),
    jq: commandVersion("jq"),
    python3: commandVersion("python3"),
  };
  return dependencyCache;
}

function inferProjectName(target, files) {
  const packagePath = files.find((filename) => filename === "package.json");
  if (packagePath) {
    const text = safeReadText(path.join(target, packagePath));
    if (text !== null) {
      try {
        const value = JSON.parse(text).name;
        if (typeof value === "string" && value.trim()) {
          return { value: safeLabel(value), source: packagePath };
        }
      } catch {
        // A broken package file is reported through scan evidence, not echoed.
      }
    }
  }
  const readme = safeReadText(path.join(target, "README.md"));
  const heading = readme?.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) {
    return { value: safeLabel(heading), source: "README.md" };
  }
  return { value: safeLabel(path.basename(target)), source: "directory-name" };
}

function packageSignals(target, files) {
  const uiPackages = new Set([
    "@angular/core",
    "@sveltejs/kit",
    "next",
    "nuxt",
    "react",
    "svelte",
    "vite",
    "vue",
  ]);
  let hasUi = files.some((filename) => /(?:^|\/)index\.html$/i.test(filename));
  let hasTests = files.some((filename) =>
    /(?:^|\/)(?:test|tests|spec)(?:\/|$)|\.(?:test|spec)\.[^.\/]+$/i.test(filename),
  );

  for (const filename of files.filter((item) => item.endsWith("package.json"))) {
    const text = safeReadText(path.join(target, filename));
    if (text === null) {
      continue;
    }
    try {
      const data = JSON.parse(text);
      const dependencies = {
        ...(data.dependencies || {}),
        ...(data.devDependencies || {}),
      };
      hasUi ||= Object.keys(dependencies).some((name) => uiPackages.has(name));
      const testScript = data.scripts?.test;
      hasTests ||=
        typeof testScript === "string" &&
        testScript.trim() !== "" &&
        !/no test specified/i.test(testScript);
    } catch {
      // Only structural signals are needed here.
    }
  }
  return { hasTests, hasUi };
}

function hookStatus(target, hasGit) {
  const directHook = path.join(target, ".git", "hooks", "pre-commit");
  let hooksPath = null;
  if (hasGit) {
    const result = spawnSync("git", ["-C", target, "config", "--get", "core.hooksPath"], {
      encoding: "utf8",
      shell: false,
      timeout: 3000,
    });
    if (result.status === 0 && result.stdout.trim()) {
      hooksPath = result.stdout.trim();
    }
  }
  const directExists = existsSync(directHook);
  let directExecutable = directExists;
  if (directExists && process.platform !== "win32") {
    try {
      accessSync(directHook, fsConstants.X_OK);
    } catch {
      directExecutable = false;
    }
  }
  const mode = hooksPath
    ? "core.hooksPath"
    : directExists && directExecutable
      ? "direct"
      : directExists
        ? "direct-non-executable"
        : "missing";
  return {
    configured: Boolean(hooksPath) || directExecutable,
    mode,
    path: hooksPath || (directExists ? ".git/hooks/pre-commit" : null),
  };
}

function executableStatus(target, layout) {
  if (process.platform === "win32") {
    return { checked: false, missing: [], nonExecutable: [] };
  }
  const base = layout === "compact" ? path.join("pm", "scripts") : "scripts";
  const missing = [];
  const nonExecutable = [];
  for (const name of SCRIPT_NAMES) {
    const relative = posixPath(path.join(base, name));
    const filename = path.join(target, relative);
    if (!existsSync(filename)) {
      missing.push(relative);
      continue;
    }
    try {
      accessSync(filename, fsConstants.X_OK);
    } catch {
      nonExecutable.push(relative);
    }
  }
  return { checked: true, missing, nonExecutable };
}

export function inspectProject(
  targetInput,
  { collisionLayout = "default", includeDependencies = true } = {},
) {
  const target = path.resolve(targetInput);
  const exists = existsSync(target);
  if (!exists) {
    return {
      target,
      exists: false,
      installation: { state: "not-installed", layout: null, version: null },
      manifest: { state: "missing", path: MANIFEST_PATH },
      scan: { files: [], directories: [], symlinks: [], warnings: [], entriesSeen: 0, truncated: false },
      repositories: [],
      deploymentMarkers: [],
      projectName: { value: path.basename(target), source: "directory-name" },
      signals: { hasGit: false, hasTests: false, hasUi: false, nonEmpty: false },
      collisions: [],
      placeholders: [],
      dependencies: includeDependencies ? dependencyStatus() : null,
      hook: { configured: false, mode: "missing", path: null },
      executables: { checked: process.platform !== "win32", missing: [], nonExecutable: [] },
    };
  }

  if (!lstatSync(target).isDirectory()) {
    throw new Error(`Target is not a directory: ${target}`);
  }

  const scan = walk(target);
  const installation = detectInstallation(target);
  const hasGit = existsSync(path.join(target, ".git"));
  const repositories = scan.directories
    .filter((relative) => existsSync(path.join(target, relative, ".git")))
    .sort();
  const deploymentMarkers = scan.files
    .filter((filename) =>
      /(?:^|\/)(?:Dockerfile(?:\.[^/]*)?|compose\.ya?ml|docker-compose\.ya?ml|fly\.toml|vercel\.json|app\.yaml)$/i.test(
        filename,
      ),
    )
    .sort();
  const signals = packageSignals(target, scan.files);
  const collisions = plannedFiles(collisionLayout)
    .filter((item) => existsSync(path.join(target, item.target)))
    .map((item) => item.target)
    .sort();
  const layoutForInspection = installation.layout || collisionLayout;
  const executables = executableStatus(target, layoutForInspection);

  return {
    target,
    exists: true,
    installation,
    manifest: inspectManifest(target),
    scan,
    repositories,
    deploymentMarkers,
    projectName: inferProjectName(target, scan.files),
    signals: {
      ...signals,
      hasGit,
      nonEmpty: scan.files.length > 0 || scan.directories.some((item) => item !== ".git"),
    },
    collisions,
    placeholders: detectPlaceholders(target, layoutForInspection),
    dependencies: includeDependencies ? dependencyStatus() : null,
    hook: hookStatus(target, hasGit),
    executables,
  };
}
