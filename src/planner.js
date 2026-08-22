import { CLI_VERSION, OUTPUT_SCHEMA_VERSION, SCAFFOLD_VERSION } from "./constants.js";
import { inspectProject, plannedFiles } from "./project.js";

export function buildPlan({ mode, target, layout }) {
  const inspection = inspectProject(target, {
    collisionLayout: layout,
    includeDependencies: false,
  });
  const operations = plannedFiles(layout).map((item) => ({
    action: item.policy === "merge-only" ? "merge" : "seed",
    source: `templates/${item.template}`,
    target: item.target,
    policy: item.policy,
    collision: inspection.collisions.includes(item.target),
  }));
  const blockers = [];
  const warnings = [];

  if (inspection.installation.state === "installed") {
    blockers.push({
      code: "install.already_present",
      message: "Solobaton is already installed; a future upgrade/adoption path must own this transition.",
    });
  } else if (inspection.installation.state === "mixed") {
    blockers.push({
      code: "install.mixed_layout",
      message: "Both layouts are present; reconcile ownership before any lifecycle write.",
    });
  } else if (inspection.installation.state === "partial") {
    blockers.push({
      code: "install.partial",
      message: "A partial installation exists; v0 will not guess which files are user-owned.",
    });
  }

  if (mode === "adopt" && !inspection.exists) {
    blockers.push({
      code: "target.not_found",
      message: "Brownfield adoption requires an existing project directory.",
    });
  }

  if (mode === "init" && inspection.exists && inspection.signals.nonEmpty) {
    warnings.push({
      code: "target.non_empty",
      message: "The target is not empty; confirm whether the brownfield adopt flow is more appropriate.",
    });
  }
  if (mode === "adopt" && inspection.exists && !inspection.signals.nonEmpty) {
    warnings.push({
      code: "target.empty",
      message: "The target is empty; the new-project init flow is probably more appropriate.",
    });
  }
  if (mode === "adopt" && layout === "default") {
    warnings.push({
      code: "layout.default_for_adopt",
      message: "Brownfield adoption normally uses compact layout; default layout needs an explicit collision review.",
    });
  }
  if (inspection.collisions.length > 0) {
    warnings.push({
      code: "files.collide",
      message: `${inspection.collisions.length} planned target path(s) already exist; no overwrite decision was made.`,
    });
  }
  if (inspection.scan.truncated) {
    warnings.push({
      code: "scan.truncated",
      message: "The project scan hit its safety limit; inspect the omitted area before Gate 1.",
    });
  }
  if (inspection.scan.symlinks.length > 0) {
    warnings.push({
      code: "scan.symlinks_skipped",
      message: `${inspection.scan.symlinks.length} symbolic link(s) were skipped and require separate inspection.`,
    });
  }
  if (inspection.scan.warnings.length > 0) {
    warnings.push({
      code: "scan.unreadable",
      message: `${inspection.scan.warnings.length} path(s) could not be inspected.`,
    });
  }

  const questions = [
    "Is this project expected to finish in a few days, or will it be maintained long term?",
    "Will anyone else open AI coding sessions for this project?",
    "Keep the default Product / Fullstack / Testing sessions, or change them?",
  ];
  if (inspection.signals.hasUi) {
    questions.push("Who decides the UI result: an existing design source, or your rendered review?");
  }

  const steps = mode === "adopt"
    ? [
        "Review the detected repositories, deployment markers, tests, and high-risk boundaries.",
        "Approve the old/new strangler boundary and establish a minimum L3 verification suite.",
        "Seed the compact coordination layout without replacing the project's existing scripts directory.",
        "Render project facts, record the first decision package, then run bus-check.",
        "Install hooks only after detecting and preserving any existing hook chain.",
      ]
    : [
        "Confirm the detected project facts and the small remaining question set.",
        "Seed the selected coordination layout and render every canonical placeholder.",
        "Merge ignore rules instead of replacing .gitignore.",
        "Record the first decision package, configure verification, then run bus-check.",
        "Install hooks only after detecting and preserving any existing hook chain.",
      ];

  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    command: mode,
    cliVersion: CLI_VERSION,
    scaffoldVersion: SCAFFOLD_VERSION,
    preview: true,
    writesPerformed: false,
    target: inspection.target,
    targetExists: inspection.exists,
    layout,
    detected: {
      projectName: inspection.projectName,
      rootGit: inspection.signals.hasGit,
      repositories: inspection.repositories,
      deploymentMarkers: inspection.deploymentMarkers,
      hasTests: inspection.signals.hasTests,
      hasUi: inspection.signals.hasUi,
      symlinksSkipped: inspection.scan.symlinks.length,
      scanTruncated: inspection.scan.truncated,
    },
    operations,
    collisions: inspection.collisions,
    blockers,
    warnings,
    questions,
    steps,
    ready: blockers.length === 0,
  };
}

export function formatPlan(plan) {
  const lines = [
    `Solobaton ${plan.command} preview`,
    `Target: ${plan.target}${plan.targetExists ? "" : " (will be created by a future write-capable version)"}`,
    `Layout: ${plan.layout}`,
    `Detected project: ${plan.detected.projectName.value} (${plan.detected.projectName.source})`,
    `Repositories: ${plan.detected.repositories.length}; deployment markers: ${plan.detected.deploymentMarkers.length}; tests: ${plan.detected.hasTests ? "detected" : "not detected"}; UI: ${plan.detected.hasUi ? "detected" : "not detected"}`,
    `Planned paths: ${plan.operations.length}; collisions: ${plan.collisions.length}`,
    "",
  ];
  for (const blocker of plan.blockers) {
    lines.push(`BLOCKER ${blocker.code}: ${blocker.message}`);
  }
  for (const warning of plan.warnings) {
    lines.push(`WARNING ${warning.code}: ${warning.message}`);
  }
  if (plan.blockers.length > 0 || plan.warnings.length > 0) {
    lines.push("");
  }
  lines.push("Remaining human questions:");
  plan.questions.forEach((question, index) => lines.push(`${index + 1}. ${question}`));
  lines.push("", "Proposed sequence:");
  plan.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  lines.push("", "No files changed. CLI v0 is preview-only.");
  return lines.join("\n");
}
