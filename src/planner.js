import {
  CLI_VERSION,
  MANIFEST_PATH,
  OUTPUT_SCHEMA_VERSION,
  SCAFFOLD_VERSION,
} from "./constants.js";
import { inspectProject, plannedFiles } from "./project.js";
import { prepareScaffold } from "./writer.js";

export function buildPlan({ mode, target, layout, preview = true, now = new Date() }) {
  const inspection = inspectProject(target, {
    collisionLayout: layout,
    includeDependencies: false,
  });
  const rendered = prepareScaffold({
    layout,
    projectName: inspection.projectName.value,
    now,
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
      message: "BuildBeat or a legacy Solobaton scaffold is already installed; a future upgrade/adoption path must own this transition.",
    });
  } else if (inspection.installation.state === "mixed") {
    blockers.push({
      code: "install.mixed_layout",
      message: "Multiple BuildBeat/legacy markers or layout signals are present; reconcile ownership before any lifecycle write.",
    });
  } else if (inspection.installation.state === "partial") {
    blockers.push({
      code: "install.partial",
      message: "A partial installation exists; the CLI will not guess which files are user-owned.",
    });
  }

  if (inspection.manifest.state !== "missing") {
    blockers.push({
      code: "manifest.already_present",
      message: "A lifecycle manifest already exists or is unreadable; reconcile it before scaffolding.",
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
    blockers.push({
      code: "files.collide",
      message: `${inspection.collisions.length} planned target path(s) collide; Wave 1 never overwrites project files.`,
    });
  }
  if (inspection.gitWorktree.state === "dirty") {
    blockers.push({
      code: "git.dirty",
      message: `The target-root Git worktree has ${inspection.gitWorktree.changes} visible change(s); commit or otherwise clean it before writing.`,
    });
  } else if (inspection.gitWorktree.state === "unavailable") {
    blockers.push({
      code: "git.status_unavailable",
      message: "A root .git entry exists, but the fixed read-only Git status check failed.",
    });
  }
  if (inspection.gitignore.state === "unsafe") {
    blockers.push({
      code: "integration.gitignore_unsafe",
      message: ".gitignore exists but is not a readable regular file.",
    });
  } else if (inspection.gitignore.beginMarkers > 0 || inspection.gitignore.endMarkers > 0) {
    blockers.push({
      code: "integration.gitignore_fragment_present",
      message: "BuildBeat or legacy Solobaton fragment markers already exist without schema 2 ownership metadata.",
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
    preview,
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
    writtenPaths: [],
    renderedPlaceholders: rendered.renderedPlaceholders,
    pendingPlaceholders: rendered.pendingPlaceholders,
    manifestPath: MANIFEST_PATH,
    nextAction: mode === "adopt"
      ? "Continue with SKILL.md §8.5 to verify the brownfield boundary and render project-owned facts."
      : "Continue with SKILL.md §8 to render project-owned facts and complete Bootstrap.",
    blockers,
    warnings,
    questions,
    steps,
    ready: blockers.length === 0,
  };
}

export function formatPlan(plan) {
  if (plan.writesPerformed) {
    const lines = [
      `BuildBeat ${plan.command} complete`,
      `Target: ${plan.target}`,
      `Layout: ${plan.layout}`,
      `Written paths: ${plan.writtenPaths.length}`,
      `Manifest: ${plan.manifestPath}`,
      `Pending placeholder files: ${plan.pendingPlaceholders.length}`,
    ];
    if (plan.pendingPlaceholders.length > 0) {
      lines.push("", "Pending placeholders:");
      plan.pendingPlaceholders.forEach((item) => {
        lines.push(`- ${item.path}: ${item.tokens.join(", ")}`);
      });
    }
    lines.push("", plan.nextAction);
    return lines.join("\n");
  }
  const lines = [
    `BuildBeat ${plan.command} ${plan.preview ? "dry run" : "write plan"}`,
    `Target: ${plan.target}${plan.targetExists ? "" : plan.preview ? " (does not exist)" : " (will be created)"}`,
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
  lines.push("Planned operations:");
  plan.operations.forEach((operation, index) => {
    lines.push(
      `${index + 1}. ${operation.action} ${operation.target} (${operation.policy})${operation.collision ? " [collision]" : ""}`,
    );
  });
  lines.push("", `Deterministic replacements: ${plan.renderedPlaceholders.length}`);
  plan.renderedPlaceholders.forEach((item) => {
    lines.push(`- ${item.path}: ${item.token} -> ${item.value}`);
  });
  lines.push("", `Pending placeholder files: ${plan.pendingPlaceholders.length}`);
  plan.pendingPlaceholders.forEach((item) => {
    lines.push(`- ${item.path}: ${item.tokens.join(", ")}`);
  });
  lines.push("");
  lines.push("Remaining human questions:");
  plan.questions.forEach((question, index) => lines.push(`${index + 1}. ${question}`));
  lines.push("", "Proposed sequence:");
  plan.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  lines.push(
    "",
    plan.preview
      ? "No files changed. This was a dry run."
      : "No files changed yet. Apply only after the confirmation prompt.",
  );
  return lines.join("\n");
}
