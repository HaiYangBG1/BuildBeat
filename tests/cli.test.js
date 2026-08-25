import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CLI_VERSION,
  COMMON_REQUIRED_FILES,
  FILE_POLICIES,
  GITIGNORE_BEGIN_MARKER,
  GITIGNORE_END_MARKER,
  LEGACY_GITIGNORE_BEGIN_MARKER,
  LEGACY_GITIGNORE_END_MARKER,
  LEGACY_MANIFEST_PATH,
  MANIFEST_PATH,
  MANIFEST_SCHEMA_VERSION,
  OPTIONAL_TEMPLATE_PREFIXES,
  OUTPUT_SCHEMA_VERSION,
  RENDER_REQUIRED_PLACEHOLDERS,
  SCAFFOLD_VERSION,
  filePolicy,
} from "../src/constants.js";
import { run } from "../src/cli.js";
import { buildPlan } from "../src/planner.js";
import { listTemplateFiles, plannedFiles, validateManifest } from "../src/project.js";
import { applyScaffold, WriteError } from "../src/writer.js";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const TEMPLATE_ROOT = path.join(REPO_ROOT, "templates");
const BIN = path.join(REPO_ROOT, "bin", "buildbeat.js");
const LEGACY_BIN = path.join(REPO_ROOT, "bin", "solobaton.js");

function tempRoot(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "buildbeat-cli-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function capture({ confirm } = {}) {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdout: { write: (value) => { stdout += String(value); } },
      stderr: { write: (value) => { stderr += String(value); } },
      ...(confirm ? { confirm } : {}),
    },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

async function invoke(args, captureOptions) {
  const output = capture(captureOptions);
  const status = await run(args, output.io);
  return { status, stdout: output.stdout(), stderr: output.stderr() };
}

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function initGit(root) {
  git(root, "init", "--quiet");
  git(root, "config", "user.name", "BuildBeat Tests");
  git(root, "config", "user.email", "buildbeat-tests@example.invalid");
  git(root, "config", "core.autocrlf", "false");
}

function commitPaths(root, ...relativePaths) {
  git(root, "add", "--", ...relativePaths);
  git(root, "commit", "--quiet", "-m", "test baseline");
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function listRelative(root) {
  const output = [];
  function visit(current, prefix = "") {
    if (!existsSync(current)) {
      return;
    }
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const relative = prefix ? path.join(prefix, entry.name) : entry.name;
      output.push(relative.split(path.sep).join("/"));
      if (entry.isDirectory()) {
        visit(path.join(current, entry.name), relative);
      }
    }
  }
  visit(root);
  return output;
}

function makeDefaultInstall(root) {
  cpSync(TEMPLATE_ROOT, root, { recursive: true });
  const marker = path.join(root, "BUILDBEAT.md");
  writeFileSync(
    marker,
    readFileSync(marker, "utf8")
      .replace("v<X.Y>", "v1.16")
      .replace("<yyyy-mm-dd> 拷入", "2026-08-22 拷入")
      .replace("<默认|紧凑>", "默认"),
  );
  mkdirSync(path.join(root, ".git", "hooks"), { recursive: true });
  writeFileSync(path.join(root, ".git", "hooks", "pre-commit"), "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(path.join(root, ".git", "hooks", "pre-commit"), 0o755);
}

function writeManifest(root, overrides = {}) {
  mkdirSync(path.dirname(path.join(root, MANIFEST_PATH)), { recursive: true });
  writeFileSync(
    path.join(root, MANIFEST_PATH),
    JSON.stringify({
      schemaVersion: 1,
      scaffoldVersion: "v1.16",
      cliVersion: CLI_VERSION,
      layout: "default",
      installedAt: "2026-08-22T00:00:00.000Z",
      files: {
        "scripts/bus-check.sh": {
          policy: "replace-if-unmodified",
          baselineSha256: "a".repeat(64),
        },
      },
      integrations: { gitignore: null, hooks: null },
      ...overrides,
    }),
  );
}

test("bin prints the package version", () => {
  const output = execFileSync(process.execPath, [BIN, "--version"], { encoding: "utf8" });
  assert.equal(output.trim(), CLI_VERSION);
  const legacyOutput = execFileSync(process.execPath, [LEGACY_BIN, "--version"], { encoding: "utf8" });
  assert.equal(legacyOutput.trim(), CLI_VERSION);
});

test("help documents the bounded Wave 1 command surface", async () => {
  const result = await invoke(["help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Wave 1 source candidate/);
  assert.match(result.stdout, /init \[path\] \[--dry-run\].*\[--yes\]/);
  assert.match(result.stdout, /upgrade, diff, and uninstall remain unavailable/);
  assert.equal(result.stderr, "");
});

test("optional standards and ADR libraries ship but stay outside default plans", () => {
  assert.deepEqual(OPTIONAL_TEMPLATE_PREFIXES, ["standards/", "pm/adr/"]);
  const templateFiles = listTemplateFiles();
  const optionalFiles = [
    "standards/STACK.md",
    "standards/CODE.md",
    "standards/REVIEW.md",
    "standards/DESIGN.md",
    "pm/adr/README.md",
    "pm/adr/ADR-0000-template.md",
  ];
  for (const filename of optionalFiles) {
    assert.ok(templateFiles.includes(filename), filename);
    assert.equal(filePolicy(filename), FILE_POLICIES.PROJECT_OWNED);
    assert.equal(COMMON_REQUIRED_FILES.includes(filename), false);
  }
  assert.ok(RENDER_REQUIRED_PLACEHOLDERS["standards/STACK.md"].includes("<项目名>"));
  assert.ok(RENDER_REQUIRED_PLACEHOLDERS["pm/adr/ADR-0000-template.md"].includes("<标题>"));
  for (const layout of ["default", "compact"]) {
    const planned = plannedFiles(layout);
    assert.equal(
      planned.some((item) => OPTIONAL_TEMPLATE_PREFIXES.some((prefix) => item.template.startsWith(prefix))),
      false,
    );
  }
});

test("non-interactive apply requires explicit confirmation and creates nothing", async (t) => {
  const parent = tempRoot(t);
  const target = path.join(parent, "future-project");
  const result = await invoke(["init", target, "--json"]);
  const error = JSON.parse(result.stdout);
  assert.equal(result.status, 2);
  assert.equal(error.schemaVersion, OUTPUT_SCHEMA_VERSION);
  assert.equal(error.command, "init");
  assert.equal(error.cliVersion, CLI_VERSION);
  assert.equal(error.ok, false);
  assert.equal(error.error.code, "confirmation_required");
  assert.equal(existsSync(target), false);
});

test("init dry-run plans default layout for a nonexistent target", async (t) => {
  const parent = tempRoot(t);
  const target = path.join(parent, "future-project");
  const result = await invoke(["init", target, "--dry-run", "--json"]);
  const plan = JSON.parse(result.stdout);
  assert.equal(result.status, 0);
  assert.equal(plan.preview, true);
  assert.equal(plan.writesPerformed, false);
  assert.equal(plan.layout, "default");
  assert.equal(plan.targetExists, false);
  assert.equal(plan.schemaVersion, OUTPUT_SCHEMA_VERSION);
  assert.ok(plan.operations.some((item) => item.target === "scripts/bus-check.sh"));
  assert.ok(plan.operations.some((item) => item.target === ".gitignore" && item.policy === "merge-only"));
  assert.ok(
    plan.operations.some(
      (item) => item.target === "AGENTS.md" && item.policy === "replace-if-unmodified",
    ),
  );
  assert.ok(
    plan.operations.some(
      (item) => item.target === "scripts/verify-status.sh" && item.policy === "project-owned",
    ),
  );
  assert.ok(plan.renderedPlaceholders.some((item) => item.token === "<项目名>"));
  assert.ok(plan.pendingPlaceholders.some((item) => item.path === "AGENTS.md"));
  assert.equal(plan.manifestPath, MANIFEST_PATH);
  assert.equal(existsSync(target), false);
});

test("init --yes writes schema 2 scaffold, deterministic values, and honest pending work", async (t) => {
  const parent = tempRoot(t);
  const target = path.join(parent, "fresh-app");
  const result = await invoke(["init", target, "--yes", "--json"]);
  const applied = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.match(result.stderr, /Planned operations:/);
  assert.match(result.stderr, /seed AGENTS\.md \(replace-if-unmodified\)/);
  assert.equal(applied.schemaVersion, OUTPUT_SCHEMA_VERSION);
  assert.equal(applied.preview, false);
  assert.equal(applied.writesPerformed, true);
  assert.equal(applied.targetExists, true);
  assert.equal(applied.manifestPath, MANIFEST_PATH);
  assert.ok(applied.writtenPaths.includes("AGENTS.md"));
  assert.ok(applied.writtenPaths.includes(".gitignore"));
  assert.ok(applied.writtenPaths.includes(MANIFEST_PATH));
  assert.ok(applied.renderedPlaceholders.some((item) => item.token === "<项目名>"));
  assert.ok(applied.pendingPlaceholders.some((item) => item.path === "AGENTS.md"));
  assert.equal(existsSync(path.join(target, "standards")), false);
  assert.equal(existsSync(path.join(target, "pm", "adr")), false);
  assert.equal(existsSync(path.join(target, "SOLOBATON.md")), false);
  assert.equal(existsSync(path.join(target, LEGACY_MANIFEST_PATH)), false);

  const agents = readFileSync(path.join(target, "AGENTS.md"), "utf8");
  const marker = readFileSync(path.join(target, "BUILDBEAT.md"), "utf8");
  assert.match(agents, /fresh-app/);
  assert.doesNotMatch(agents, /<项目名>/);
  assert.match(marker, new RegExp(`BuildBeat ${"`"}${SCAFFOLD_VERSION}${"`"}`));
  assert.doesNotMatch(marker, /<X\.Y>|<yyyy-mm-dd>|<默认\|紧凑>/);
  if (process.platform !== "win32") {
    assert.notEqual(statSync(path.join(target, "scripts", "bus-check.sh")).mode & 0o111, 0);
  }

  const manifest = JSON.parse(readFileSync(path.join(target, MANIFEST_PATH), "utf8"));
  assert.equal(manifest.schemaVersion, MANIFEST_SCHEMA_VERSION);
  assert.equal(manifest.scaffoldVersion, SCAFFOLD_VERSION);
  assert.equal(manifest.layout, "default");
  assert.equal(Object.hasOwn(manifest.files, ".gitignore"), false);
  assert.equal(Object.hasOwn(manifest.files, "gitignore.template"), false);
  assert.equal(Object.hasOwn(manifest.files, MANIFEST_PATH), false);
  assert.equal(
    Object.values(manifest.files).some((item) => item.policy === FILE_POLICIES.THREE_WAY_ONLY),
    false,
  );
  assert.equal(
    manifest.files["AGENTS.md"].baselineSha256,
    hash(readFileSync(path.join(target, "AGENTS.md"))),
  );
  assert.deepEqual(validateManifest(manifest, target), []);

  const doctor = await invoke(["doctor", target, "--json"]);
  const report = JSON.parse(doctor.stdout);
  assert.equal(doctor.status, 1);
  assert.deepEqual(
    report.findings.filter((item) => item.level === "error").map((item) => item.code),
    ["git.not_initialized"],
  );
  assert.ok(report.findings.some((item) => item.code === "placeholder.remaining"));
});

test("init writes into a clean root Git repository and doctor has no error", async (t) => {
  const target = tempRoot(t);
  initGit(target);

  const result = await invoke(["init", target, "--yes", "--json"]);
  assert.equal(result.status, 0);
  const doctor = await invoke(["doctor", target, "--json"]);
  const report = JSON.parse(doctor.stdout);
  assert.equal(doctor.status, 0);
  assert.equal(report.summary.errors, 0);
  assert.equal(report.manifest.schemaVersion, MANIFEST_SCHEMA_VERSION);
  assert.ok(report.findings.some((item) => item.code === "placeholder.remaining"));
});

test("interactive confirmation can cancel without writing", async (t) => {
  const parent = tempRoot(t);
  const target = path.join(parent, "cancelled-project");
  const result = await invoke(["init", target], { confirm: async () => false });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Cancelled\. No files changed\./);
  assert.equal(existsSync(target), false);
});

test("adopt dry-run defaults to compact layout and detects project signals", async (t) => {
  const target = tempRoot(t);
  initGit(target);
  mkdirSync(path.join(target, "service one", ".git"), { recursive: true });
  mkdirSync(path.join(target, ".claude", "worktrees", "tool-only", ".git"), { recursive: true });
  writeFileSync(
    path.join(target, "package.json"),
    JSON.stringify({ name: "brownfield-app", scripts: { test: "node --test" }, dependencies: { react: "1.0.0" } }),
  );
  writeFileSync(path.join(target, "Dockerfile"), "FROM scratch\n");
  writeFileSync(path.join(target, ".gitignore"), "/service one/\n/.claude/worktrees/\n");
  commitPaths(target, "package.json", "Dockerfile", ".gitignore");
  const before = listRelative(target);

  const result = await invoke(["adopt", target, "--dry-run", "--json"]);
  const plan = JSON.parse(result.stdout);
  assert.equal(result.status, 0);
  assert.equal(plan.layout, "compact");
  assert.equal(plan.detected.projectName.value, "brownfield-app");
  assert.deepEqual(plan.detected.repositories, ["service one"]);
  assert.equal(plan.detected.hasTests, true);
  assert.equal(plan.detected.hasUi, true);
  assert.ok(plan.detected.deploymentMarkers.includes("Dockerfile"));
  assert.ok(plan.operations.some((item) => item.target === "pm/scripts/bus-check.sh"));
  assert.ok(plan.questions.length === 4);
  assert.deepEqual(listRelative(target), before);
});

test("adopt detects browser-extension UI from a nested manifest", async (t) => {
  const target = tempRoot(t);
  initGit(target);
  mkdirSync(path.join(target, "extension"), { recursive: true });
  writeFileSync(
    path.join(target, "extension", "manifest.json"),
    `${JSON.stringify(
      {
        manifest_version: 3,
        name: "Manifest-only extension",
        version: "1.0.0",
        action: {},
        content_scripts: [{ matches: ["https://example.invalid/*"], js: ["content.js"] }],
      },
      null,
      2,
    )}\n`,
  );
  commitPaths(target, "extension/manifest.json");

  const result = await invoke(["adopt", target, "--dry-run", "--json"]);
  const plan = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(plan.detected.hasUi, true);
  assert.ok(plan.questions.some((question) => /UI result/i.test(question)));
});

test("adopt --yes writes the compact layout into a clean brownfield repository", async (t) => {
  const target = tempRoot(t);
  initGit(target);
  writeFileSync(
    path.join(target, "package.json"),
    `${JSON.stringify({ name: "brownfield-app", scripts: { test: "node --test" } }, null, 2)}\n`,
  );
  commitPaths(target, "package.json");

  const result = await invoke(["adopt", target, "--yes", "--json"]);
  const applied = JSON.parse(result.stdout);
  assert.equal(result.status, 0);
  assert.equal(applied.layout, "compact");
  assert.ok(applied.writtenPaths.includes("pm/scripts/bus-check.sh"));
  assert.ok(applied.writtenPaths.includes("pm/BUILDBEAT.md"));
  assert.equal(existsSync(path.join(target, "scripts", "bus-check.sh")), false);
  assert.equal(existsSync(path.join(target, "BUILDBEAT.md")), false);
  assert.match(readFileSync(path.join(target, "AGENTS.md"), "utf8"), /pm\/scripts\/bus-check\.sh/);
  assert.ok(
    applied.renderedPlaceholders.some(
      (item) => item.path === "AGENTS.md" && item.token === "scripts/" && item.value === "pm/scripts/",
    ),
  );
  const manifest = JSON.parse(readFileSync(path.join(target, MANIFEST_PATH), "utf8"));
  assert.equal(manifest.layout, "compact");
  assert.equal(manifest.files["pm/BUILDBEAT.md"].policy, FILE_POLICIES.REPLACE_IF_UNMODIFIED);
});

test("planned destination collisions fail closed before confirmation", async (t) => {
  const target = tempRoot(t);
  writeFileSync(path.join(target, "AGENTS.md"), "# Existing ownership\n");
  const before = readFileSync(path.join(target, "AGENTS.md"), "utf8");

  const result = await invoke(["init", target, "--yes", "--json"]);
  const plan = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.equal(plan.writesPerformed, false);
  assert.ok(plan.collisions.includes("AGENTS.md"));
  assert.ok(plan.blockers.some((item) => item.code === "files.collide"));
  assert.equal(readFileSync(path.join(target, "AGENTS.md"), "utf8"), before);
  assert.equal(existsSync(path.join(target, MANIFEST_PATH)), false);
});

test("dirty or unreadable root Git state blocks writes", async (t) => {
  const dirty = tempRoot(t);
  initGit(dirty);
  writeFileSync(path.join(dirty, "README.md"), "# Uncommitted\n");
  const dirtyResult = await invoke(["init", dirty, "--yes", "--json"]);
  const dirtyPlan = JSON.parse(dirtyResult.stdout);
  assert.equal(dirtyResult.status, 1);
  assert.ok(dirtyPlan.blockers.some((item) => item.code === "git.dirty"));
  assert.equal(existsSync(path.join(dirty, "AGENTS.md")), false);

  const invalid = tempRoot(t);
  mkdirSync(path.join(invalid, ".git"));
  const invalidResult = await invoke(["init", invalid, "--yes", "--json"]);
  const invalidPlan = JSON.parse(invalidResult.stdout);
  assert.equal(invalidResult.status, 1);
  assert.ok(invalidPlan.blockers.some((item) => item.code === "git.status_unavailable"));
  assert.equal(existsSync(path.join(invalid, "AGENTS.md")), false);
});

test("gitignore fragment is unique, hashed exactly, and a second init is idempotently blocked", async (t) => {
  const target = tempRoot(t);
  initGit(target);
  const original = Buffer.from("# project-owned prefix\ncustom.cache\n", "utf8");
  writeFileSync(path.join(target, ".gitignore"), original);
  commitPaths(target, ".gitignore");

  const first = await invoke(["init", target, "--yes", "--json"]);
  assert.equal(first.status, 0);
  const merged = readFileSync(path.join(target, ".gitignore"));
  const mergedText = merged.toString("utf8");
  assert.equal(merged.subarray(0, original.length).equals(original), true);
  assert.equal(mergedText.split(GITIGNORE_BEGIN_MARKER).length - 1, 1);
  assert.equal(mergedText.split(GITIGNORE_END_MARKER).length - 1, 1);

  const fragmentStart = merged.indexOf(Buffer.from(GITIGNORE_BEGIN_MARKER));
  const fragmentEnd = merged.indexOf(Buffer.from(`${GITIGNORE_END_MARKER}\n`))
    + Buffer.byteLength(`${GITIGNORE_END_MARKER}\n`);
  const manifest = JSON.parse(readFileSync(path.join(target, MANIFEST_PATH), "utf8"));
  assert.equal(
    manifest.integrations.gitignore.baselineSha256,
    hash(merged.subarray(fragmentStart, fragmentEnd)),
  );

  const second = await invoke(["init", target, "--yes", "--json"]);
  const secondPlan = JSON.parse(second.stdout);
  assert.equal(second.status, 1);
  assert.ok(secondPlan.blockers.some((item) => item.code === "install.already_present"));
  const afterSecond = readFileSync(path.join(target, ".gitignore"), "utf8");
  assert.equal(afterSecond.split(GITIGNORE_BEGIN_MARKER).length - 1, 1);
});

test("in-process failure removes created paths and restores .gitignore byte-for-byte", (t) => {
  const target = tempRoot(t);
  initGit(target);
  const original = Buffer.from("# exact bytes\r\ncustom.cache\r\n", "utf8");
  writeFileSync(path.join(target, ".gitignore"), original);
  commitPaths(target, ".gitignore");
  const now = new Date("2026-08-25T01:02:03.000Z");
  const plan = buildPlan({ mode: "init", target, layout: "default", preview: false, now });
  assert.equal(plan.ready, true);

  assert.throws(
    () => applyScaffold(plan, {
      now,
      faultInjector: ({ phase }) => {
        if (phase === "gitignore") {
          throw new Error("injected transaction failure");
        }
      },
    }),
    (error) => error instanceof WriteError && error.code === "write.failed",
  );
  assert.equal(readFileSync(path.join(target, ".gitignore")).equals(original), true);
  assert.equal(existsSync(path.join(target, "AGENTS.md")), false);
  assert.equal(existsSync(path.join(target, MANIFEST_PATH)), false);
  assert.equal(git(target, "status", "--porcelain=v1", "--untracked-files=all"), "");
  assert.equal(listRelative(target).some((item) => item.includes(".buildbeat-") && item.endsWith(".tmp")), false);
});

test("rollback removes a target directory created by the failed invocation", (t) => {
  const parent = tempRoot(t);
  const target = path.join(parent, "failed-new-project");
  const now = new Date("2026-08-25T01:02:03.000Z");
  const plan = buildPlan({ mode: "init", target, layout: "default", preview: false, now });
  assert.throws(
    () => applyScaffold(plan, {
      now,
      faultInjector: ({ phase }) => {
        if (phase === "file") {
          throw new Error("stop after first file");
        }
      },
    }),
    (error) => error instanceof WriteError && error.code === "write.failed",
  );
  assert.equal(existsSync(target), false);
});

test("symlinked planned parents and gitignore hosts are refused without traversal", async (t) => {
  const parent = tempRoot(t);
  const target = path.join(parent, "project");
  const outside = path.join(parent, "outside");
  mkdirSync(target);
  mkdirSync(outside);
  symlinkSync(outside, path.join(target, "pm"));
  const parentResult = await invoke(["init", target, "--yes", "--json"]);
  const parentPlan = JSON.parse(parentResult.stdout);
  assert.equal(parentResult.status, 1);
  assert.ok(parentPlan.blockers.some((item) => item.code === "files.collide"));
  assert.equal(listRelative(outside).length, 0);

  rmSync(path.join(target, "pm"));
  writeFileSync(path.join(outside, "host-ignore"), "# outside\n");
  symlinkSync(path.join(outside, "host-ignore"), path.join(target, ".gitignore"));
  const ignoreResult = await invoke(["init", target, "--yes", "--json"]);
  const ignorePlan = JSON.parse(ignoreResult.stdout);
  assert.equal(ignoreResult.status, 1);
  assert.ok(ignorePlan.blockers.some((item) => item.code === "integration.gitignore_unsafe"));
  assert.equal(readFileSync(path.join(outside, "host-ignore"), "utf8"), "# outside\n");
});

test("adopt refuses to plan a nonexistent brownfield target", async (t) => {
  const parent = tempRoot(t);
  const target = path.join(parent, "missing-project");
  const result = await invoke(["adopt", target, "--dry-run", "--json"]);
  const plan = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.ok(plan.blockers.some((item) => item.code === "target.not_found"));
  assert.equal(existsSync(target), false);
});

test("init warns when a non-empty target looks brownfield", async (t) => {
  const target = tempRoot(t);
  writeFileSync(path.join(target, "README.md"), "# Existing product\n");
  const result = await invoke(["init", target, "--dry-run", "--json"]);
  const plan = JSON.parse(result.stdout);
  assert.equal(result.status, 0);
  assert.ok(plan.warnings.some((item) => item.code === "target.non_empty"));
});

test("an existing installation blocks init planning", async (t) => {
  const target = tempRoot(t);
  makeDefaultInstall(target);
  const result = await invoke(["init", target, "--dry-run", "--json"]);
  const plan = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.equal(plan.ready, false);
  assert.ok(plan.blockers.some((item) => item.code === "install.already_present"));
});

test("doctor reports no installation as an error", async (t) => {
  const target = tempRoot(t);
  mkdirSync(path.join(target, ".git"));
  const result = await invoke(["doctor", target, "--json"]);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((item) => item.code === "install.not_found"));
});

test("doctor accepts a complete unmanaged BuildBeat layout but names its lifecycle limits", async (t) => {
  const target = tempRoot(t);
  makeDefaultInstall(target);
  const result = await invoke(["doctor", target, "--json"]);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 0);
  assert.equal(report.installation.layout, "default");
  assert.equal(report.installation.namespace, "buildbeat");
  assert.equal(report.installation.version, "v1.16");
  assert.ok(report.findings.some((item) => item.code === "manifest.missing"));
  assert.ok(report.findings.some((item) => item.code === "placeholder.remaining"));
});

test("doctor fails closed on mixed layouts", async (t) => {
  const target = tempRoot(t);
  makeDefaultInstall(target);
  mkdirSync(path.join(target, "pm", "scripts"), { recursive: true });
  writeFileSync(path.join(target, "pm", "BUILDBEAT.md"), "**本项目使用 BuildBeat `v1.16`**\n");
  writeFileSync(path.join(target, "pm", "scripts", "bus-check.sh"), "#!/usr/bin/env bash\n");
  const result = await invoke(["doctor", target, "--json"]);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.ok(report.findings.some((item) => item.code === "install.mixed_layout"));
});

test("doctor fails closed when canonical and legacy namespaces coexist", async (t) => {
  const target = tempRoot(t);
  makeDefaultInstall(target);
  writeManifest(target);
  writeFileSync(
    path.join(target, "SOLOBATON.md"),
    readFileSync(path.join(target, "BUILDBEAT.md"), "utf8").replaceAll("BuildBeat", "Solobaton"),
  );
  mkdirSync(path.dirname(path.join(target, LEGACY_MANIFEST_PATH)), { recursive: true });
  writeFileSync(
    path.join(target, LEGACY_MANIFEST_PATH),
    readFileSync(path.join(target, MANIFEST_PATH), "utf8"),
  );

  const result = await invoke(["doctor", target, "--json"]);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.ok(report.findings.some((item) => item.code === "install.mixed_layout"));
  assert.ok(report.findings.some((item) => item.code === "manifest.ambiguous"));
});

test("doctor fails closed on an invalid manifest", async (t) => {
  const target = tempRoot(t);
  makeDefaultInstall(target);
  mkdirSync(path.dirname(path.join(target, MANIFEST_PATH)));
  writeFileSync(path.join(target, MANIFEST_PATH), "{not-json\n");
  const result = await invoke(["doctor", target, "--json"]);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.ok(report.findings.some((item) => item.code === "manifest.invalid"));
});

test("doctor rejects an unsupported manifest schema", async (t) => {
  const target = tempRoot(t);
  makeDefaultInstall(target);
  mkdirSync(path.dirname(path.join(target, MANIFEST_PATH)));
  writeFileSync(
    path.join(target, MANIFEST_PATH),
    JSON.stringify({ schemaVersion: 99, scaffoldVersion: "v1.16", layout: "default" }),
  );
  const result = await invoke(["doctor", target, "--json"]);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.ok(report.findings.some((item) => item.code === "manifest.unsupported_schema"));
});

test("doctor accepts a structurally valid aligned manifest", async (t) => {
  const target = tempRoot(t);
  makeDefaultInstall(target);
  writeManifest(target);
  const result = await invoke(["doctor", target, "--json"]);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 0);
  assert.equal(report.manifest.state, "present");
  assert.equal(report.findings.some((item) => item.code.startsWith("manifest.")), false);
});

test("doctor reads legacy Solobaton marker and manifest namespaces", async (t) => {
  const target = tempRoot(t);
  makeDefaultInstall(target);
  const canonicalMarker = path.join(target, "BUILDBEAT.md");
  writeFileSync(
    path.join(target, "SOLOBATON.md"),
    readFileSync(canonicalMarker, "utf8").replaceAll("BuildBeat", "Solobaton"),
  );
  rmSync(canonicalMarker);
  mkdirSync(path.dirname(path.join(target, LEGACY_MANIFEST_PATH)), { recursive: true });
  writeFileSync(
    path.join(target, LEGACY_MANIFEST_PATH),
    JSON.stringify({
      schemaVersion: 1,
      scaffoldVersion: "v1.16",
      cliVersion: CLI_VERSION,
      layout: "default",
      installedAt: "2026-08-22T00:00:00.000Z",
      files: {
        "scripts/bus-check.sh": {
          policy: "replace-if-unmodified",
          baselineSha256: "a".repeat(64),
        },
      },
      integrations: { gitignore: null, hooks: null },
    }),
  );

  const result = await invoke(["doctor", target, "--json"]);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 0);
  assert.equal(report.installation.namespace, "solobaton");
  assert.equal(report.installation.markerPath, "SOLOBATON.md");
  assert.equal(report.manifest.namespace, "solobaton");
  assert.equal(report.manifest.path, LEGACY_MANIFEST_PATH);
  assert.ok(report.findings.some((item) => item.code === "install.legacy_namespace"));
});

test("schema 1 keeps historical policy compatibility while schema 2 rejects three-way-only", async (t) => {
  const target = tempRoot(t);
  makeDefaultInstall(target);
  writeManifest(target, {
    files: {
      "AGENTS.md": {
        policy: FILE_POLICIES.THREE_WAY_ONLY,
        baselineSha256: "b".repeat(64),
      },
    },
  });
  const legacy = await invoke(["doctor", target, "--json"]);
  const legacyReport = JSON.parse(legacy.stdout);
  assert.equal(legacy.status, 0);
  assert.equal(legacyReport.findings.some((item) => item.code === "manifest.invalid_file_policy"), false);

  writeManifest(target, {
    schemaVersion: 2,
    files: {
      "AGENTS.md": {
        policy: FILE_POLICIES.THREE_WAY_ONLY,
        baselineSha256: "b".repeat(64),
      },
    },
    integrations: { gitignore: null, hooks: null },
  });
  const current = await invoke(["doctor", target, "--json"]);
  const currentReport = JSON.parse(current.stdout);
  assert.equal(current.status, 1);
  assert.ok(currentReport.findings.some((item) => item.code === "manifest.invalid_file_policy"));
});

test("schema 2 validates the exact gitignore integration contract", (t) => {
  const target = tempRoot(t);
  writeFileSync(path.join(target, ".gitignore"), "# host\n");
  const base = {
    schemaVersion: 2,
    scaffoldVersion: SCAFFOLD_VERSION,
    cliVersion: CLI_VERSION,
    layout: "default",
    installedAt: "2026-08-25T00:00:00.000Z",
    files: {},
    integrations: {
      gitignore: {
        path: ".gitignore",
        beginMarker: GITIGNORE_BEGIN_MARKER,
        endMarker: GITIGNORE_END_MARKER,
        baselineSha256: "a".repeat(64),
      },
      hooks: null,
    },
  };
  assert.deepEqual(validateManifest(base, target), []);
  const legacyMarkers = structuredClone(base);
  legacyMarkers.integrations.gitignore.beginMarker = LEGACY_GITIGNORE_BEGIN_MARKER;
  legacyMarkers.integrations.gitignore.endMarker = LEGACY_GITIGNORE_END_MARKER;
  assert.deepEqual(validateManifest(legacyMarkers, target), []);
  const invalid = structuredClone(base);
  invalid.integrations.gitignore.beginMarker = "# arbitrary marker";
  invalid.integrations.gitignore.extra = true;
  invalid.integrations.hooks = {};
  const codes = new Set(validateManifest(invalid, target).map((item) => item.code));
  assert.ok(codes.has("manifest.invalid_gitignore_integration"));
  assert.ok(codes.has("manifest.invalid_gitignore_markers"));
  assert.ok(codes.has("manifest.invalid_integration_record"));
});

test("doctor rejects manifest layout and scaffold version mismatches", async (t) => {
  const target = tempRoot(t);
  makeDefaultInstall(target);
  writeManifest(target, { layout: "compact", scaffoldVersion: "v1.15" });
  const result = await invoke(["doctor", target, "--json"]);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.ok(report.findings.some((item) => item.code === "manifest.layout_mismatch"));
  assert.ok(report.findings.some((item) => item.code === "manifest.version_mismatch"));
});

test("doctor rejects unsafe or unvalidated schema 1 manifest fields", async (t) => {
  const target = tempRoot(t);
  makeDefaultInstall(target);
  writeManifest(target, {
    installedAt: "yesterday",
    files: {
      "../../outside": {
        policy: "overwrite-anything",
        baselineSha256: "not-a-sha",
        unexpected: true,
      },
    },
    integrations: { gitignore: {}, hooks: null },
    unexpected: true,
  });
  const result = await invoke(["doctor", target, "--json"]);
  const report = JSON.parse(result.stdout);
  const codes = new Set(report.findings.map((item) => item.code));
  assert.equal(result.status, 1);
  assert.ok(codes.has("manifest.unknown_field"));
  assert.ok(codes.has("manifest.invalid_installed_at"));
  assert.ok(codes.has("manifest.invalid_file_path"));
  assert.ok(codes.has("manifest.invalid_file_record"));
  assert.ok(codes.has("manifest.invalid_file_policy"));
  assert.ok(codes.has("manifest.invalid_file_hash"));
  assert.ok(codes.has("manifest.invalid_integration_record"));
});

test("reserved lifecycle commands are explicit rather than simulated", async () => {
  for (const command of ["diff", "upgrade", "uninstall"]) {
    const result = await invoke([command, "--json"]);
    const error = JSON.parse(result.stdout);
    assert.equal(result.status, 2);
    assert.equal(error.schemaVersion, OUTPUT_SCHEMA_VERSION);
    assert.equal(error.command, command);
    assert.equal(error.cliVersion, CLI_VERSION);
    assert.equal(error.ok, false);
    assert.equal(error.error.code, "command_not_available");
  }
});

test("JSON usage errors use the versioned error envelope", async () => {
  const result = await invoke(["init", "--layout", "sideways", "--dry-run", "--json"]);
  const error = JSON.parse(result.stdout);
  assert.equal(result.status, 2);
  assert.equal(error.schemaVersion, OUTPUT_SCHEMA_VERSION);
  assert.equal(error.command, "init");
  assert.equal(error.cliVersion, CLI_VERSION);
  assert.equal(error.ok, false);
  assert.equal(error.error.code, "usage");
});

test("invalid options use the stable usage exit code", async () => {
  const result = await invoke(["init", "--layout", "sideways", "--dry-run"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--layout must be default or compact/);
});

test("--yes is apply-only and cannot weaken dry-run semantics", async (t) => {
  const target = tempRoot(t);
  const result = await invoke(["init", target, "--dry-run", "--yes", "--json"]);
  const error = JSON.parse(result.stdout);
  assert.equal(result.status, 2);
  assert.equal(error.error.code, "usage");
  assert.equal(listRelative(target).length, 0);
});
