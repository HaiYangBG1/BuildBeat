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
  FILE_POLICIES,
  GITIGNORE_BEGIN_MARKER,
  GITIGNORE_END_MARKER,
  GITIGNORE_MARKER_PAIRS,
  IGNORED_SCAN_DIRECTORIES,
  LEGACY_MANIFEST_PATH,
  LEGACY_MARKER_FILE,
  MANIFEST_PATH,
  MANIFEST_PATHS,
  MARKER_FILE,
  OPTIONAL_TEMPLATE_PREFIXES,
  RENDER_REQUIRED_PLACEHOLDERS,
  SCRIPT_NAMES,
  SUPPORTED_MANIFEST_SCHEMA_VERSIONS,
  filePolicy,
} from "./constants.js";

const TEMPLATE_ROOT = fileURLToPath(new URL("../templates/", import.meta.url));
const MAX_SCAN_DEPTH = 4;
const MAX_SCAN_ENTRIES = 5000;
const TEXT_LIMIT_BYTES = 512 * 1024;
const MAX_MANIFEST_FILES = 5000;
const MANIFEST_TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "scaffoldVersion",
  "cliVersion",
  "layout",
  "installedAt",
  "files",
  "integrations",
]);
const MANIFEST_FILE_KEYS = new Set(["policy", "baselineSha256"]);
const MANIFEST_INTEGRATION_KEYS = ["gitignore", "hooks"];
const MANIFEST_GITIGNORE_KEYS = new Set([
  "path",
  "beginMarker",
  "endMarker",
  "baselineSha256",
]);
const MANIFEST_POLICIES = {
  1: new Set(Object.values(FILE_POLICIES)),
  2: new Set([
    FILE_POLICIES.REPLACE_IF_UNMODIFIED,
    FILE_POLICIES.PROJECT_OWNED,
    FILE_POLICIES.MERGE_ONLY,
  ]),
};

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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function isSafeManifestPath(target, value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.endsWith("/") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    path.posix.normalize(value) !== value
  ) {
    return false;
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return false;
  }

  const resolved = path.resolve(target, ...segments);
  const relative = path.relative(target, resolved);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return false;
  }

  let current = target;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        return false;
      }
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        break;
      }
      return false;
    }
  }
  return true;
}

export function validateManifest(data, target) {
  const issues = [];
  const seen = new Set();
  const addIssue = (code, message) => {
    if (!seen.has(code)) {
      seen.add(code);
      issues.push({ code, message });
    }
  };

  if (!isPlainObject(data)) {
    addIssue("manifest.invalid_root", "Manifest root must be a JSON object.");
    return issues;
  }
  if (!Number.isInteger(data.schemaVersion)) {
    addIssue("manifest.invalid_schema_version", "Manifest schemaVersion must be an integer.");
    return issues;
  }
  if (!SUPPORTED_MANIFEST_SCHEMA_VERSIONS.includes(data.schemaVersion)) {
    return issues;
  }
  const schemaVersion = data.schemaVersion;

  if (Object.keys(data).some((key) => !MANIFEST_TOP_LEVEL_KEYS.has(key))) {
    addIssue(
      "manifest.unknown_field",
      `Manifest contains a field not defined by schema ${schemaVersion}.`,
    );
  }
  if (typeof data.scaffoldVersion !== "string" || !/^v\d+\.\d+(?:\.\d+)?$/.test(data.scaffoldVersion)) {
    addIssue("manifest.invalid_scaffold_version", "Manifest scaffoldVersion is missing or invalid.");
  }
  if (typeof data.cliVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(data.cliVersion)) {
    addIssue("manifest.invalid_cli_version", "Manifest cliVersion is missing or invalid.");
  }
  if (!["default", "compact"].includes(data.layout)) {
    addIssue("manifest.invalid_layout", "Manifest layout must be default or compact.");
  }
  if (!isCanonicalTimestamp(data.installedAt)) {
    addIssue("manifest.invalid_installed_at", "Manifest installedAt must be a canonical UTC timestamp.");
  }

  if (!isPlainObject(data.files)) {
    addIssue("manifest.invalid_files", "Manifest files must be an object record.");
  } else {
    const entries = Object.entries(data.files);
    if (entries.length > MAX_MANIFEST_FILES) {
      addIssue("manifest.too_many_files", `Manifest files cannot exceed ${MAX_MANIFEST_FILES} entries.`);
    }
    for (const [filename, record] of entries.slice(0, MAX_MANIFEST_FILES)) {
      if (!isSafeManifestPath(target, filename)) {
        addIssue(
          "manifest.invalid_file_path",
          "Manifest file paths must be normalized repository-relative paths without symlink traversal.",
        );
      }
      if (
        schemaVersion === 2 &&
        [...MANIFEST_PATHS, ".gitignore", "gitignore.template"].includes(filename)
      ) {
        addIssue(
          "manifest.reserved_file_path",
          "Schema 2 files must exclude the manifest, source-only ignore template, and .gitignore host.",
        );
      }
      if (!isPlainObject(record)) {
        addIssue("manifest.invalid_file_record", "Each manifest file entry must be an object record.");
        continue;
      }
      if (Object.keys(record).some((key) => !MANIFEST_FILE_KEYS.has(key))) {
        addIssue("manifest.invalid_file_record", "Manifest file entries contain only policy and baselineSha256.");
      }
      if (!MANIFEST_POLICIES[schemaVersion].has(record.policy)) {
        addIssue("manifest.invalid_file_policy", "Manifest file policy is missing or unsupported.");
      }
      if (typeof record.baselineSha256 !== "string" || !/^[0-9a-f]{64}$/.test(record.baselineSha256)) {
        addIssue(
          "manifest.invalid_file_hash",
          "Manifest baselineSha256 must be exactly 64 lowercase hexadecimal characters.",
        );
      }
    }
  }

  if (!isPlainObject(data.integrations)) {
    addIssue("manifest.invalid_integrations", "Manifest integrations must be an object record.");
  } else {
    const keys = Object.keys(data.integrations);
    if (
      keys.length !== MANIFEST_INTEGRATION_KEYS.length ||
      MANIFEST_INTEGRATION_KEYS.some((key) => !Object.hasOwn(data.integrations, key)) ||
      keys.some((key) => !MANIFEST_INTEGRATION_KEYS.includes(key))
    ) {
      addIssue(
        "manifest.invalid_integrations",
        `Schema ${schemaVersion} integrations must contain exactly gitignore and hooks.`,
      );
    }
    if (schemaVersion === 1) {
      if (MANIFEST_INTEGRATION_KEYS.some((key) => data.integrations[key] !== null)) {
        addIssue(
          "manifest.invalid_integration_record",
          "Schema 1 integration records must be null until a write-capable schema defines them.",
        );
      }
    } else {
      if (data.integrations.hooks !== null) {
        addIssue(
          "manifest.invalid_integration_record",
          "Schema 2 hooks must remain null; hook installation is a manual Skill step.",
        );
      }
      const gitignore = data.integrations.gitignore;
      if (gitignore !== null) {
        if (!isPlainObject(gitignore)) {
          addIssue(
            "manifest.invalid_gitignore_integration",
            "Schema 2 gitignore integration must be null or an object record.",
          );
        } else {
          const keys = Object.keys(gitignore);
          if (
            keys.length !== MANIFEST_GITIGNORE_KEYS.size ||
            keys.some((key) => !MANIFEST_GITIGNORE_KEYS.has(key))
          ) {
            addIssue(
              "manifest.invalid_gitignore_integration",
              "Schema 2 gitignore integration must contain exactly path, beginMarker, endMarker, and baselineSha256.",
            );
          }
          if (gitignore.path !== ".gitignore" || !isSafeManifestPath(target, gitignore.path)) {
            addIssue(
              "manifest.invalid_gitignore_path",
              "Schema 2 gitignore integration path must be the safe .gitignore host path.",
            );
          }
          if (!GITIGNORE_MARKER_PAIRS.some(
            ([beginMarker, endMarker]) =>
              gitignore.beginMarker === beginMarker && gitignore.endMarker === endMarker,
          )) {
            addIssue(
              "manifest.invalid_gitignore_markers",
              "Schema 2 gitignore integration must use one complete BuildBeat or legacy Solobaton marker pair.",
            );
          }
          if (
            typeof gitignore.baselineSha256 !== "string" ||
            !/^[0-9a-f]{64}$/.test(gitignore.baselineSha256)
          ) {
            addIssue(
              "manifest.invalid_gitignore_hash",
              "Schema 2 gitignore baselineSha256 must be exactly 64 lowercase hexadecimal characters.",
            );
          }
        }
      }
    }
  }

  return issues;
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
    if (templatePath === "BUILDBEAT.md" || templatePath === "指挥台.md") {
      return `pm/${templatePath}`;
    }
  }
  return templatePath;
}

export function plannedFiles(layout) {
  return listTemplateFiles()
    .filter(
      (templatePath) =>
        !OPTIONAL_TEMPLATE_PREFIXES.some((prefix) => templatePath.startsWith(prefix)),
    )
    .map((templatePath) => ({
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
  const match = text.match(/本项目使用 (?:BuildBeat|Solobaton) `(v\d+\.\d+(?:\.\d+)?)`/);
  return match ? match[1] : null;
}

function detectInstallation(target) {
  const markers = [
    { layout: "default", namespace: "buildbeat", relative: MARKER_FILE },
    { layout: "compact", namespace: "buildbeat", relative: `pm/${MARKER_FILE}` },
    { layout: "default", namespace: "solobaton", relative: LEGACY_MARKER_FILE },
    { layout: "compact", namespace: "solobaton", relative: `pm/${LEGACY_MARKER_FILE}` },
  ];
  const presentMarkers = markers.filter((item) => existsSync(path.join(target, item.relative)));
  const defaultEvidence =
    presentMarkers.some((item) => item.layout === "default") ||
    existsSync(path.join(target, "scripts", "bus-check.sh"));
  const compactEvidence =
    presentMarkers.some((item) => item.layout === "compact") ||
    existsSync(path.join(target, "pm", "scripts", "bus-check.sh"));

  if ((defaultEvidence && compactEvidence) || presentMarkers.length > 1) {
    return { state: "mixed", layout: null, version: null, namespace: null, markerPath: null };
  }
  if (presentMarkers.length === 1) {
    const marker = presentMarkers[0];
    return {
      state: "installed",
      layout: marker.layout,
      version: parseVersion(path.join(target, marker.relative)),
      namespace: marker.namespace,
      markerPath: marker.relative,
    };
  }
  if (defaultEvidence) {
    return { state: "partial", layout: "default", version: null, namespace: null, markerPath: null };
  }
  if (compactEvidence) {
    return { state: "partial", layout: "compact", version: null, namespace: null, markerPath: null };
  }
  return { state: "not-installed", layout: null, version: null, namespace: null, markerPath: null };
}

function inspectManifest(target) {
  const presentPaths = MANIFEST_PATHS.filter((relative) => existsSync(path.join(target, relative)));
  if (presentPaths.length === 0) {
    return { state: "missing", path: MANIFEST_PATH };
  }
  if (presentPaths.length > 1) {
    return { state: "ambiguous", path: MANIFEST_PATH, paths: presentPaths };
  }
  const relativePath = presentPaths[0];
  const filename = path.join(target, relativePath);
  const text = safeReadText(filename);
  if (text === null) {
    return { state: "invalid", path: relativePath, reason: "unreadable" };
  }
  try {
    const data = JSON.parse(text);
    const root = isPlainObject(data) ? data : {};
    const validationIssues = validateManifest(data, target);
    return {
      state: "present",
      path: relativePath,
      namespace: relativePath === LEGACY_MANIFEST_PATH ? "solobaton" : "buildbeat",
      schemaVersion: Number.isInteger(root.schemaVersion) ? root.schemaVersion : null,
      scaffoldVersion:
        typeof root.scaffoldVersion === "string" ? safeLabel(root.scaffoldVersion).slice(0, 40) : null,
      cliVersion: typeof root.cliVersion === "string" ? safeLabel(root.cliVersion).slice(0, 40) : null,
      layout: typeof root.layout === "string" ? safeLabel(root.layout).slice(0, 40) : null,
      installedAt: typeof root.installedAt === "string" ? safeLabel(root.installedAt).slice(0, 40) : null,
      validationIssues,
    };
  } catch {
    return { state: "invalid", path: relativePath, reason: "invalid-json" };
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

function browserExtensionHasUi(target, files) {
  const uiKeys = [
    "action",
    "browser_action",
    "content_scripts",
    "options_page",
    "options_ui",
    "page_action",
    "side_panel",
  ];

  for (const filename of files.filter(
    (item) => path.basename(item).toLowerCase() === "manifest.json",
  )) {
    const text = safeReadText(path.join(target, filename));
    if (text === null) {
      continue;
    }
    try {
      const data = JSON.parse(text);
      if (
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        [2, 3].includes(data.manifest_version) &&
        uiKeys.some((key) => Object.hasOwn(data, key))
      ) {
        return true;
      }
    } catch {
      // A malformed or unrelated manifest is not a trustworthy UI signal.
    }
  }
  return false;
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
  let hasUi =
    files.some((filename) => /(?:^|\/)index\.html$/i.test(filename)) ||
    browserExtensionHasUi(target, files);
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

function gitWorktreeStatus(target, hasGit) {
  if (!hasGit) {
    return { state: "not-initialized", changes: 0 };
  }
  const result = spawnSync(
    "git",
    ["-C", target, "status", "--porcelain=v1", "--untracked-files=all"],
    {
      encoding: "utf8",
      shell: false,
      timeout: 5000,
    },
  );
  if (result.error || result.status !== 0) {
    return { state: "unavailable", changes: 0 };
  }
  const changes = result.stdout
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .length;
  return { state: changes === 0 ? "clean" : "dirty", changes };
}

function countOccurrences(text, token) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(token, offset);
    if (index === -1) {
      return count;
    }
    count += 1;
    offset = index + token.length;
  }
}

function gitignoreStatus(target) {
  const filename = path.join(target, ".gitignore");
  if (!existsSync(filename)) {
    return { state: "missing", beginMarkers: 0, endMarkers: 0 };
  }
  try {
    const stat = lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return { state: "unsafe", beginMarkers: 0, endMarkers: 0 };
    }
    const text = readFileSync(filename, "utf8");
    const beginMarkers = GITIGNORE_MARKER_PAIRS.reduce(
      (count, [beginMarker]) => count + countOccurrences(text, beginMarker),
      0,
    );
    const endMarkers = GITIGNORE_MARKER_PAIRS.reduce(
      (count, [, endMarker]) => count + countOccurrences(text, endMarker),
      0,
    );
    return { state: "present", beginMarkers, endMarkers };
  } catch {
    return { state: "unsafe", beginMarkers: 0, endMarkers: 0 };
  }
}

function plannedPathCollision(target, item) {
  const segments = item.target.split("/");
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    if (!existsSync(current)) {
      break;
    }
    try {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        return true;
      }
    } catch {
      return true;
    }
  }
  return item.policy !== FILE_POLICIES.MERGE_ONLY && existsSync(path.join(target, item.target));
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
      installation: {
        state: "not-installed",
        layout: null,
        version: null,
        namespace: null,
        markerPath: null,
      },
      manifest: { state: "missing", path: MANIFEST_PATH },
      scan: { files: [], directories: [], symlinks: [], warnings: [], entriesSeen: 0, truncated: false },
      repositories: [],
      deploymentMarkers: [],
      projectName: { value: path.basename(target), source: "directory-name" },
      signals: { hasGit: false, hasTests: false, hasUi: false, nonEmpty: false },
      gitWorktree: { state: "not-initialized", changes: 0 },
      gitignore: { state: "missing", beginMarkers: 0, endMarkers: 0 },
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
    .filter((item) => plannedPathCollision(target, item))
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
    gitWorktree: gitWorktreeStatus(target, hasGit),
    gitignore: gitignoreStatus(target),
    collisions,
    placeholders: detectPlaceholders(target, layoutForInspection),
    dependencies: includeDependencies ? dependencyStatus() : null,
    hook: hookStatus(target, hasGit),
    executables,
  };
}
