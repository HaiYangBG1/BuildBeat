import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLI_VERSION,
  FILE_POLICIES,
  GITIGNORE_BEGIN_MARKER,
  GITIGNORE_END_MARKER,
  GITIGNORE_MARKER_PAIRS,
  MANIFEST_PATH,
  MANIFEST_SCHEMA_VERSION,
  RENDER_REQUIRED_PLACEHOLDERS,
  SCAFFOLD_VERSION,
} from "./constants.js";
import { inspectProject, plannedFiles } from "./project.js";

const TEMPLATE_ROOT = fileURLToPath(new URL("../templates/", import.meta.url));
const COMPACT_SCRIPT_REFERENCE_TEMPLATES = new Set([
  "AGENTS.md",
  "ARCHITECTURE.md",
  "contracts/PROTOCOL.md",
  "pm/NOW.md",
  "pm/status/README.md",
  "pm/当期看板.md",
  "指挥台.md",
]);

export class WriteError extends Error {
  constructor(code, message, cause = null) {
    super(message, cause ? { cause } : undefined);
    this.name = "WriteError";
    this.code = code;
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function replaceAll(text, token, value) {
  return text.split(token).join(value);
}

function stableDate(now) {
  const value = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(value.getTime())) {
    throw new WriteError("render.invalid_date", "The scaffold render date is invalid.");
  }
  return value;
}

function localCalendarDate(now) {
  const value = stableDate(now);
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function deterministicValues({ layout, projectName, now }) {
  return new Map([
    ["<项目名>", projectName || "project"],
    ["<yyyy-mm-dd>", localCalendarDate(now)],
    ["<X.Y>", SCAFFOLD_VERSION.replace(/^v/, "")],
    ["<默认|紧凑>", layout === "compact" ? "紧凑" : "默认"],
  ]);
}

function ownedGitignoreFragment(body) {
  const normalizedBody = body.replace(/\r\n/g, "\n").replace(/\n*$/, "");
  return Buffer.from(
    `${GITIGNORE_BEGIN_MARKER}\n${normalizedBody}\n${GITIGNORE_END_MARKER}\n`,
    "utf8",
  );
}

export function prepareScaffold({ layout, projectName, now = new Date() }) {
  const values = deterministicValues({ layout, projectName, now });
  const files = [];
  const renderedPlaceholders = [];
  const pendingPlaceholders = [];
  let gitignore = null;

  for (const item of plannedFiles(layout)) {
    const source = path.join(TEMPLATE_ROOT, item.template);
    let text = readFileSync(source, "utf8");
    for (const [token, value] of values) {
      if (text.includes(token)) {
        text = replaceAll(text, token, value);
        renderedPlaceholders.push({ path: item.target, token, value });
      }
    }
    if (
      layout === "compact" &&
      COMPACT_SCRIPT_REFERENCE_TEMPLATES.has(item.template) &&
      text.includes("scripts/")
    ) {
      text = replaceAll(text, "scripts/", "pm/scripts/");
      renderedPlaceholders.push({
        path: item.target,
        token: "scripts/",
        value: "pm/scripts/",
      });
    }

    const pendingTokens = (RENDER_REQUIRED_PLACEHOLDERS[item.template] || [])
      .filter((token) => text.includes(token));
    if (pendingTokens.length > 0) {
      pendingPlaceholders.push({ path: item.target, tokens: pendingTokens });
    }

    const mode = lstatSync(source).mode & 0o777;
    if (item.policy === FILE_POLICIES.MERGE_ONLY) {
      const fragment = ownedGitignoreFragment(text);
      gitignore = {
        ...item,
        fragment,
        baselineSha256: sha256(fragment),
        mode,
      };
    } else {
      const content = Buffer.from(text, "utf8");
      files.push({
        ...item,
        content,
        baselineSha256: sha256(content),
        mode,
      });
    }
  }

  renderedPlaceholders.sort((a, b) =>
    a.path.localeCompare(b.path) || a.token.localeCompare(b.token),
  );
  pendingPlaceholders.sort((a, b) => a.path.localeCompare(b.path));
  if (gitignore === null) {
    throw new WriteError("integration.gitignore_missing", "The bundled gitignore template is missing.");
  }
  return { files, gitignore, renderedPlaceholders, pendingPlaceholders };
}

function ensureDirectory(directory, createdDirectories) {
  if (existsSync(directory)) {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new WriteError("path.unsafe", `A required directory path is not a real directory: ${directory}`);
    }
    return;
  }
  const parent = path.dirname(directory);
  if (parent === directory) {
    throw new WriteError("path.unsafe", `Cannot create target directory: ${directory}`);
  }
  ensureDirectory(parent, createdDirectories);
  try {
    mkdirSync(directory, { mode: 0o755 });
    createdDirectories.push(directory);
  } catch (error) {
    if (error.code === "EEXIST") {
      ensureDirectory(directory, createdDirectories);
      return;
    }
    throw error;
  }
}

function assertRelativeTarget(relative) {
  if (
    typeof relative !== "string" ||
    relative.length === 0 ||
    relative.includes("\\") ||
    path.posix.isAbsolute(relative) ||
    path.win32.isAbsolute(relative) ||
    path.posix.normalize(relative) !== relative ||
    relative.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new WriteError("path.unsafe", `Unsafe scaffold target path: ${relative}`);
  }
}

function ensureTargetParent(target, relative, createdDirectories) {
  assertRelativeTarget(relative);
  ensureDirectory(path.dirname(path.join(target, ...relative.split("/"))), createdDirectories);
}

function fsyncDirectory(directory) {
  if (process.platform === "win32") {
    return;
  }
  const descriptor = openSync(directory, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function atomicWrite(
  filename,
  bytes,
  mode,
  { overwrite = false, nextTempId, onRenamed = null },
) {
  const parent = path.dirname(filename);
  const basename = path.basename(filename);
  let temp = null;
  let descriptor = null;
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = path.join(
        parent,
        `.${basename}.buildbeat-${process.pid}-${nextTempId()}-${attempt}.tmp`,
      );
      try {
        descriptor = openSync(candidate, "wx", mode);
        temp = candidate;
        break;
      } catch (error) {
        if (error.code !== "EEXIST") {
          throw error;
        }
      }
    }
    if (descriptor === null || temp === null) {
      throw new WriteError("write.temp_unavailable", `Could not allocate a temporary sibling for ${filename}.`);
    }
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    chmodSync(temp, mode);

    if (!overwrite && existsSync(filename)) {
      throw new WriteError("files.collide", `Destination appeared during the write transaction: ${filename}`);
    }
    if (overwrite) {
      const current = lstatSync(filename);
      if (!current.isFile() || current.isSymbolicLink()) {
        throw new WriteError("integration.gitignore_unsafe", ".gitignore is no longer a regular file.");
      }
    }
    renameSync(temp, filename);
    temp = null;
    if (typeof onRenamed === "function") {
      onRenamed();
    }
    fsyncDirectory(parent);
  } finally {
    if (descriptor !== null) {
      closeSync(descriptor);
    }
    if (temp !== null) {
      try {
        unlinkSync(temp);
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }
  }
}

function markerCount(text, marker) {
  return text.split(marker).length - 1;
}

function assertGitignoreBytesSafe(bytes) {
  const text = bytes.toString("utf8");
  if (GITIGNORE_MARKER_PAIRS.some(
    ([beginMarker, endMarker]) =>
      markerCount(text, beginMarker) !== 0 || markerCount(text, endMarker) !== 0,
  )) {
    throw new WriteError(
      "integration.gitignore_fragment_present",
      "A BuildBeat or legacy Solobaton .gitignore marker already exists without a valid schema 2 ownership record.",
    );
  }
}

function mergeGitignore(existing, fragment) {
  if (existing.length === 0) {
    return fragment;
  }
  const separator = existing.at(-1) === 0x0a ? Buffer.from("\n") : Buffer.from("\n\n");
  return Buffer.concat([existing, separator, fragment]);
}

function preflight(plan) {
  if (plan.preview || plan.writesPerformed || !["init", "adopt"].includes(plan.command)) {
    throw new WriteError("write.invalid_plan", "Only a ready init/adopt apply plan can be written.");
  }
  let inspection;
  try {
    inspection = inspectProject(plan.target, {
      collisionLayout: plan.layout,
      includeDependencies: false,
    });
  } catch (error) {
    throw new WriteError("target.unsafe", error.message, error);
  }
  if (plan.command === "adopt" && !inspection.exists) {
    throw new WriteError("target.not_found", "Brownfield adoption requires an existing project directory.");
  }
  if (inspection.installation.state !== "not-installed") {
    throw new WriteError(
      `install.${inspection.installation.state.replaceAll("-", "_")}`,
      "The target is already installed, partial, or mixed; no write was attempted.",
    );
  }
  if (inspection.manifest.state !== "missing") {
    throw new WriteError(
      "manifest.already_present",
      "A lifecycle manifest already exists or is unreadable; ownership cannot be inferred.",
    );
  }
  if (inspection.collisions.length > 0) {
    throw new WriteError(
      "files.collide",
      `${inspection.collisions.length} destination path(s) collide with existing project content.`,
    );
  }
  if (inspection.gitWorktree.state === "dirty") {
    throw new WriteError("git.dirty", "The target-root Git worktree is not clean.");
  }
  if (inspection.gitWorktree.state === "unavailable") {
    throw new WriteError("git.status_unavailable", "The target has a root .git entry, but Git status failed.");
  }
  if (inspection.gitignore.state === "unsafe") {
    throw new WriteError("integration.gitignore_unsafe", ".gitignore is not a readable regular file.");
  }
  if (inspection.gitignore.beginMarkers > 0 || inspection.gitignore.endMarkers > 0) {
    throw new WriteError(
      "integration.gitignore_fragment_present",
      "A BuildBeat or legacy Solobaton .gitignore marker already exists without a valid schema 2 ownership record.",
    );
  }
  return inspection;
}

function rollback({ createdFiles, createdDirectories, gitignoreBackup, gitignoreModified, nextTempId }) {
  const failures = [];
  for (const filename of [...createdFiles].reverse()) {
    try {
      unlinkSync(filename);
    } catch (error) {
      if (error.code !== "ENOENT") {
        failures.push(`${filename}: ${error.code || error.message}`);
      }
    }
  }
  if (gitignoreModified && gitignoreBackup !== null) {
    try {
      atomicWrite(
        gitignoreBackup.path,
        gitignoreBackup.bytes,
        gitignoreBackup.mode,
        { overwrite: true, nextTempId },
      );
    } catch (error) {
      failures.push(`${gitignoreBackup.path}: ${error.code || error.message}`);
    }
  }
  for (const directory of [...createdDirectories].reverse()) {
    try {
      rmdirSync(directory);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") {
        failures.push(`${directory}: ${error.code || error.message}`);
      }
    }
  }
  return failures;
}

export function applyScaffold(plan, { now = new Date(), faultInjector = null } = {}) {
  const inspection = preflight(plan);
  const rendered = prepareScaffold({
    layout: plan.layout,
    projectName: inspection.projectName.value,
    now,
  });
  const target = path.resolve(plan.target);
  const createdFiles = [];
  const createdDirectories = [];
  let gitignoreBackup = null;
  let gitignoreModified = false;
  let tempId = 0;
  const nextTempId = () => {
    tempId += 1;
    return tempId;
  };
  const maybeFault = (phase, relative) => {
    if (typeof faultInjector === "function") {
      faultInjector({ phase, path: relative, writes: createdFiles.length });
    }
  };

  try {
    ensureDirectory(target, createdDirectories);

    for (const item of rendered.files) {
      ensureTargetParent(target, item.target, createdDirectories);
      const filename = path.join(target, ...item.target.split("/"));
      atomicWrite(filename, item.content, item.mode, {
        nextTempId,
        onRenamed: () => createdFiles.push(filename),
      });
      maybeFault("file", item.target);
    }

    const gitignorePath = path.join(target, ".gitignore");
    ensureTargetParent(target, ".gitignore", createdDirectories);
    let existingGitignore = Buffer.alloc(0);
    let gitignoreMode = rendered.gitignore.mode || 0o644;
    const gitignoreExisted = existsSync(gitignorePath);
    if (gitignoreExisted) {
      const stat = lstatSync(gitignorePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new WriteError("integration.gitignore_unsafe", ".gitignore is not a regular file.");
      }
      existingGitignore = readFileSync(gitignorePath);
      assertGitignoreBytesSafe(existingGitignore);
      gitignoreMode = stat.mode & 0o777;
      gitignoreBackup = { path: gitignorePath, bytes: existingGitignore, mode: gitignoreMode };
    }
    atomicWrite(
      gitignorePath,
      mergeGitignore(existingGitignore, rendered.gitignore.fragment),
      gitignoreMode,
      {
        overwrite: gitignoreExisted,
        nextTempId,
        onRenamed: () => {
          if (gitignoreExisted) {
            gitignoreModified = true;
          } else {
            createdFiles.push(gitignorePath);
          }
        },
      },
    );
    maybeFault("gitignore", ".gitignore");

    const manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      scaffoldVersion: SCAFFOLD_VERSION,
      cliVersion: CLI_VERSION,
      layout: plan.layout,
      installedAt: stableDate(now).toISOString(),
      files: Object.fromEntries(
        rendered.files.map((item) => [
          item.target,
          { policy: item.policy, baselineSha256: item.baselineSha256 },
        ]),
      ),
      integrations: {
        gitignore: {
          path: ".gitignore",
          beginMarker: GITIGNORE_BEGIN_MARKER,
          endMarker: GITIGNORE_END_MARKER,
          baselineSha256: rendered.gitignore.baselineSha256,
        },
        hooks: null,
      },
    };
    ensureTargetParent(target, MANIFEST_PATH, createdDirectories);
    maybeFault("before-manifest", MANIFEST_PATH);
    const manifestFilename = path.join(target, ...MANIFEST_PATH.split("/"));
    atomicWrite(
      manifestFilename,
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
      0o644,
      {
        nextTempId,
        onRenamed: () => createdFiles.push(manifestFilename),
      },
    );

    return {
      ...plan,
      preview: false,
      writesPerformed: true,
      targetExists: true,
      detected: {
        ...plan.detected,
        projectName: inspection.projectName,
      },
      writtenPaths: [
        ...rendered.files.map((item) => item.target),
        ".gitignore",
        MANIFEST_PATH,
      ],
      renderedPlaceholders: rendered.renderedPlaceholders,
      pendingPlaceholders: rendered.pendingPlaceholders,
      manifestPath: MANIFEST_PATH,
      ready: true,
    };
  } catch (error) {
    const rollbackFailures = rollback({
      createdFiles,
      createdDirectories,
      gitignoreBackup,
      gitignoreModified,
      nextTempId,
    });
    if (rollbackFailures.length > 0) {
      throw new WriteError(
        "rollback.incomplete",
        `Write failed and rollback was incomplete: ${rollbackFailures.join("; ")}`,
        error,
      );
    }
    if (error instanceof WriteError) {
      throw error;
    }
    throw new WriteError("write.failed", `Scaffold write failed and was rolled back: ${error.message}`, error);
  }
}
