import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  CLI_VERSION,
  COMMON_REQUIRED_FILES,
  MANIFEST_SCHEMA_VERSION,
  SCRIPT_NAMES,
} from "./constants.js";
import { inspectProject } from "./project.js";

const LEVEL_ORDER = { error: 0, warning: 1, info: 2 };

function add(findings, level, code, message, relativePath = null) {
  findings.push({ level, code, message, path: relativePath });
}

function requiredFiles(layout) {
  const scriptBase = layout === "compact" ? "pm/scripts" : "scripts";
  const localFiles = layout === "compact"
    ? ["pm/SOLOBATON.md", "pm/指挥台.md"]
    : ["SOLOBATON.md", "指挥台.md"];
  return [
    ...COMMON_REQUIRED_FILES,
    ...localFiles,
    ...SCRIPT_NAMES.map((name) => `${scriptBase}/${name}`),
  ];
}

function verifyStatusHasPlaceholders(target, layout) {
  const relative = layout === "compact"
    ? "pm/scripts/verify-status.sh"
    : "scripts/verify-status.sh";
  const filename = path.join(target, relative);
  if (!existsSync(filename)) {
    return { relative, unconfigured: false };
  }
  const text = readFileSync(filename, "utf8");
  return { relative, unconfigured: text.includes("<套件1>") || text.includes("<代码子仓1>") };
}

export function runDoctor(targetInput) {
  const inspection = inspectProject(targetInput);
  const findings = [];
  const { installation } = inspection;

  if (!inspection.exists) {
    add(findings, "error", "target.not_found", "Target directory does not exist.");
  } else if (installation.state === "not-installed") {
    add(findings, "error", "install.not_found", "No Solobaton installation was detected.");
  } else if (installation.state === "mixed") {
    add(
      findings,
      "error",
      "install.mixed_layout",
      "Default and compact layout evidence both exist; ownership is ambiguous.",
    );
  } else if (installation.state === "partial") {
    add(
      findings,
      "error",
      "install.partial",
      `A partial ${installation.layout} layout was detected without a version marker.`,
    );
  }

  if (installation.state === "installed") {
    if (!installation.version) {
      add(findings, "error", "version.unreadable", "SOLOBATON.md has no readable installed version.");
    }
    for (const relative of requiredFiles(installation.layout)) {
      if (!existsSync(path.join(inspection.target, relative))) {
        add(findings, "error", "file.missing", "Required scaffold file is missing.", relative);
      }
    }
    const verify = verifyStatusHasPlaceholders(inspection.target, installation.layout);
    if (verify.unconfigured) {
      add(
        findings,
        "warning",
        "verification.unconfigured",
        "verify-status still contains suite placeholders; L3 automation is not configured.",
        verify.relative,
      );
    }
  }

  if (inspection.manifest.state === "missing" && installation.state === "installed") {
    add(
      findings,
      "warning",
      "manifest.missing",
      "This is a legacy/unmanaged installation; safe automated upgrade and uninstall are unavailable.",
      inspection.manifest.path,
    );
  } else if (inspection.manifest.state === "invalid") {
    add(findings, "error", "manifest.invalid", "The lifecycle manifest is unreadable or invalid JSON.", inspection.manifest.path);
  } else if (
    inspection.manifest.state === "present" &&
    inspection.manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION
  ) {
    add(
      findings,
      "error",
      "manifest.unsupported_schema",
      `Manifest schema ${inspection.manifest.schemaVersion ?? "unknown"} is not supported.`,
      inspection.manifest.path,
    );
  } else if (inspection.manifest.state === "present") {
    if (!["default", "compact"].includes(inspection.manifest.layout)) {
      add(
        findings,
        "error",
        "manifest.invalid_layout",
        "Manifest layout must be default or compact.",
        inspection.manifest.path,
      );
    }
    if (!/^v\d+\.\d+(?:\.\d+)?$/.test(inspection.manifest.scaffoldVersion || "")) {
      add(
        findings,
        "error",
        "manifest.invalid_scaffold_version",
        "Manifest scaffoldVersion is missing or invalid.",
        inspection.manifest.path,
      );
    }
    if (!/^\d+\.\d+\.\d+$/.test(inspection.manifest.cliVersion || "")) {
      add(
        findings,
        "error",
        "manifest.invalid_cli_version",
        "Manifest cliVersion is missing or invalid.",
        inspection.manifest.path,
      );
    }
    if (!inspection.manifest.hasFiles || !inspection.manifest.hasIntegrations) {
      add(
        findings,
        "error",
        "manifest.incomplete",
        "Manifest must contain object-valued files and integrations records.",
        inspection.manifest.path,
      );
    }
    if (
      installation.state === "installed" &&
      inspection.manifest.layout &&
      inspection.manifest.layout !== installation.layout
    ) {
      add(
        findings,
        "error",
        "manifest.layout_mismatch",
        "Manifest layout does not match the detected installation layout.",
        inspection.manifest.path,
      );
    }
    if (
      installation.state === "installed" &&
      installation.version &&
      inspection.manifest.scaffoldVersion &&
      inspection.manifest.scaffoldVersion !== installation.version
    ) {
      add(
        findings,
        "error",
        "manifest.version_mismatch",
        "Manifest scaffoldVersion does not match SOLOBATON.md.",
        inspection.manifest.path,
      );
    }
  }

  for (const item of inspection.placeholders) {
    add(
      findings,
      "warning",
      "placeholder.remaining",
      `Canonical placeholders remain: ${item.tokens.join(", ")}`,
      item.path,
    );
  }

  if (inspection.exists && !inspection.signals.hasGit) {
    add(findings, "error", "git.not_initialized", "The target has no root .git entry.");
  }
  if (inspection.exists && inspection.hook.mode === "direct-non-executable") {
    add(
      findings,
      "warning",
      "hook.non_executable",
      "The root pre-commit hook exists but is not executable.",
      inspection.hook.path,
    );
  } else if (inspection.exists && !inspection.hook.configured) {
    add(
      findings,
      "warning",
      "hook.missing",
      "No root pre-commit hook or core.hooksPath configuration was detected.",
    );
  }

  for (const command of ["git", "bash"]) {
    if (!inspection.dependencies[command].available) {
      add(findings, "error", `dependency.${command}_missing`, `${command} is required but unavailable.`);
    }
  }
  if (!inspection.dependencies.gitleaks.available) {
    add(
      findings,
      "warning",
      "dependency.gitleaks_missing",
      "gitleaks is unavailable; the local Secret gate degrades to a warning.",
    );
  }
  if (!inspection.dependencies.python3.available) {
    add(findings, "info", "dependency.python_missing", "Python 3 is unavailable; design preview cannot run.");
  }
  if (!inspection.dependencies.jq.available) {
    add(findings, "info", "dependency.jq_missing", "jq is unavailable; production drift checks cannot run.");
  }
  if (inspection.scan.truncated) {
    add(
      findings,
      "warning",
      "scan.truncated",
      "Project scan hit the 5,000-entry safety limit; results are incomplete.",
    );
  }
  for (const item of inspection.scan.warnings) {
    add(findings, "warning", "scan.unreadable", `Path could not be inspected: ${item.reason}.`, item.path);
  }

  findings.sort((a, b) =>
    LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
    a.code.localeCompare(b.code) ||
    (a.path || "").localeCompare(b.path || ""),
  );
  const summary = {
    errors: findings.filter((item) => item.level === "error").length,
    warnings: findings.filter((item) => item.level === "warning").length,
    info: findings.filter((item) => item.level === "info").length,
  };

  return {
    schemaVersion: 1,
    command: "doctor",
    cliVersion: CLI_VERSION,
    target: inspection.target,
    installation: inspection.installation,
    manifest: inspection.manifest,
    capabilities: inspection.dependencies,
    findings,
    summary,
    ok: summary.errors === 0,
  };
}

export function formatDoctor(report) {
  const lines = [
    "Solobaton doctor",
    `Target: ${report.target}`,
    `Installation: ${report.installation.state}${report.installation.layout ? ` (${report.installation.layout})` : ""}${report.installation.version ? ` ${report.installation.version}` : ""}`,
    `Manifest: ${report.manifest.state}`,
    "",
  ];
  if (report.findings.length === 0) {
    lines.push("OK No findings.");
  } else {
    for (const finding of report.findings) {
      const location = finding.path ? ` [${finding.path}]` : "";
      lines.push(`${finding.level.toUpperCase()} ${finding.code}${location}: ${finding.message}`);
    }
  }
  lines.push(
    "",
    `Result: ${report.summary.errors} error(s), ${report.summary.warnings} warning(s), ${report.summary.info} info item(s).`,
  );
  return lines.join("\n");
}
