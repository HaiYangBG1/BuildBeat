import assert from "node:assert/strict";
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
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CLI_VERSION } from "../src/constants.js";
import { run } from "../src/cli.js";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const TEMPLATE_ROOT = path.join(REPO_ROOT, "templates");
const BIN = path.join(REPO_ROOT, "bin", "solobaton.js");

function tempRoot(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "solobaton-cli-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function capture() {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdout: { write: (value) => { stdout += String(value); } },
      stderr: { write: (value) => { stderr += String(value); } },
    },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

async function invoke(args) {
  const output = capture();
  const status = await run(args, output.io);
  return { status, stdout: output.stdout(), stderr: output.stderr() };
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
  const marker = path.join(root, "SOLOBATON.md");
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
  mkdirSync(path.join(root, ".solobaton"), { recursive: true });
  writeFileSync(
    path.join(root, ".solobaton", "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      scaffoldVersion: "v1.16",
      cliVersion: "1.16.0",
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
});

test("help documents the preview-only boundary", async () => {
  const result = await invoke(["help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /CLI v0 is read-only/);
  assert.match(result.stdout, /init \[path\] --dry-run/);
  assert.equal(result.stderr, "");
});

test("init without dry-run is rejected and creates nothing", async (t) => {
  const parent = tempRoot(t);
  const target = path.join(parent, "future-project");
  const result = await invoke(["init", target, "--json"]);
  const error = JSON.parse(result.stdout);
  assert.equal(result.status, 2);
  assert.equal(error.schemaVersion, 1);
  assert.equal(error.command, "init");
  assert.equal(error.cliVersion, CLI_VERSION);
  assert.equal(error.ok, false);
  assert.equal(error.error.code, "write_phase_not_available");
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
  assert.ok(plan.operations.some((item) => item.target === "scripts/bus-check.sh"));
  assert.ok(plan.operations.some((item) => item.target === ".gitignore" && item.policy === "merge-only"));
  assert.ok(plan.operations.some((item) => item.target === "AGENTS.md" && item.policy === "three-way-only"));
  assert.ok(
    plan.operations.some(
      (item) => item.target === "scripts/verify-status.sh" && item.policy === "project-owned",
    ),
  );
  assert.equal(existsSync(target), false);
});

test("adopt dry-run defaults to compact layout and detects project signals", async (t) => {
  const target = tempRoot(t);
  mkdirSync(path.join(target, ".git"));
  mkdirSync(path.join(target, "service one", ".git"), { recursive: true });
  mkdirSync(path.join(target, ".claude", "worktrees", "tool-only", ".git"), { recursive: true });
  writeFileSync(
    path.join(target, "package.json"),
    JSON.stringify({ name: "brownfield-app", scripts: { test: "node --test" }, dependencies: { react: "1.0.0" } }),
  );
  writeFileSync(path.join(target, "Dockerfile"), "FROM scratch\n");
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

test("doctor accepts a complete legacy layout but names its lifecycle limits", async (t) => {
  const target = tempRoot(t);
  makeDefaultInstall(target);
  const result = await invoke(["doctor", target, "--json"]);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 0);
  assert.equal(report.installation.layout, "default");
  assert.equal(report.installation.version, "v1.16");
  assert.ok(report.findings.some((item) => item.code === "manifest.missing"));
  assert.ok(report.findings.some((item) => item.code === "placeholder.remaining"));
});

test("doctor fails closed on mixed layouts", async (t) => {
  const target = tempRoot(t);
  makeDefaultInstall(target);
  mkdirSync(path.join(target, "pm", "scripts"), { recursive: true });
  writeFileSync(path.join(target, "pm", "SOLOBATON.md"), "**本项目使用 Solobaton `v1.16`**\n");
  writeFileSync(path.join(target, "pm", "scripts", "bus-check.sh"), "#!/usr/bin/env bash\n");
  const result = await invoke(["doctor", target, "--json"]);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.ok(report.findings.some((item) => item.code === "install.mixed_layout"));
});

test("doctor fails closed on an invalid manifest", async (t) => {
  const target = tempRoot(t);
  makeDefaultInstall(target);
  mkdirSync(path.join(target, ".solobaton"));
  writeFileSync(path.join(target, ".solobaton", "manifest.json"), "{not-json\n");
  const result = await invoke(["doctor", target, "--json"]);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.ok(report.findings.some((item) => item.code === "manifest.invalid"));
});

test("doctor rejects an unsupported manifest schema", async (t) => {
  const target = tempRoot(t);
  makeDefaultInstall(target);
  mkdirSync(path.join(target, ".solobaton"));
  writeFileSync(
    path.join(target, ".solobaton", "manifest.json"),
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
    assert.equal(error.schemaVersion, 1);
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
  assert.equal(error.schemaVersion, 1);
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
