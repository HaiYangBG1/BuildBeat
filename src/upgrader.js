import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
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

import {
  CLI_VERSION,
  FILE_POLICIES,
  GITIGNORE_BEGIN_MARKER,
  GITIGNORE_END_MARKER,
  GITIGNORE_MARKER_PAIRS,
  MANIFEST_PATH,
  MANIFEST_SCHEMA_VERSION,
  OUTPUT_SCHEMA_VERSION,
  SCAFFOLD_VERSION,
} from "./constants.js";
import { runDoctor } from "./doctor.js";
import { inspectProject, validateManifest } from "./project.js";
import { prepareScaffold, WriteError } from "./writer.js";

const INTERNAL = Symbol("upgrade-context");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function addUnique(items, item) {
  if (!items.some((existing) => existing.code === item.code && existing.path === item.path)) {
    items.push(item);
  }
}

function parseVersion(value) {
  const match = typeof value === "string"
    ? value.match(/^v(\d+)\.(\d+)(?:\.(\d+))?$/)
    : null;
  if (!match) {
    return null;
  }
  const parts = match.slice(1).map((part) => Number(part || 0));
  return parts.every((part) => Number.isSafeInteger(part)) ? parts : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] < right[index] ? -1 : 1;
    }
  }
  return 0;
}

function relativeFilename(target, relative) {
  return path.join(target, ...relative.split("/"));
}

function readPathState(target, relative) {
  const filename = relativeFilename(target, relative);
  try {
    const stat = lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return { kind: "unsafe", filename, hash: null, bytes: null, mode: null };
    }
    const bytes = readFileSync(filename);
    return {
      kind: "file",
      filename,
      hash: sha256(bytes),
      bytes,
      mode: stat.mode & 0o777,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { kind: "missing", filename, hash: null, bytes: null, mode: null };
    }
    return { kind: "unsafe", filename, hash: null, bytes: null, mode: null };
  }
}

function targetParentsSafe(target, relative) {
  let current = target;
  for (const segment of relative.split("/").slice(0, -1)) {
    current = path.join(current, segment);
    try {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        return false;
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        return true;
      }
      return false;
    }
  }
  return true;
}

function markerCount(bytes, marker) {
  const token = Buffer.from(marker, "utf8");
  let count = 0;
  let offset = 0;
  while (offset <= bytes.length - token.length) {
    const index = bytes.indexOf(token, offset);
    if (index === -1) {
      break;
    }
    count += 1;
    offset = index + token.length;
  }
  return count;
}

function extractOwnedFragment(bytes, integration) {
  for (const [beginMarker, endMarker] of GITIGNORE_MARKER_PAIRS) {
    const expectedPair =
      beginMarker === integration.beginMarker && endMarker === integration.endMarker;
    const beginCount = markerCount(bytes, beginMarker);
    const endCount = markerCount(bytes, endMarker);
    if (expectedPair) {
      if (beginCount !== 1 || endCount !== 1) {
        return { ok: false, reason: "missing-or-duplicate" };
      }
    } else if (beginCount !== 0 || endCount !== 0) {
      return { ok: false, reason: "ambiguous-marker-pairs" };
    }
  }

  const begin = Buffer.from(integration.beginMarker, "utf8");
  const end = Buffer.from(integration.endMarker, "utf8");
  const start = bytes.indexOf(begin);
  const endStart = bytes.indexOf(end, start + begin.length);
  if (start === -1 || endStart === -1 || endStart < start) {
    return { ok: false, reason: "invalid-marker-order" };
  }
  const beginLineEnd = start + begin.length;
  const beginHasLineStart = start === 0 || bytes[start - 1] === 0x0a;
  const beginHasLineEnd =
    bytes[beginLineEnd] === 0x0a ||
    (bytes[beginLineEnd] === 0x0d && bytes[beginLineEnd + 1] === 0x0a);
  const endHasLineStart = endStart > 0 && bytes[endStart - 1] === 0x0a;
  const rawEnd = endStart + end.length;
  const endHasLineEnd =
    bytes[rawEnd] === 0x0a ||
    (bytes[rawEnd] === 0x0d && bytes[rawEnd + 1] === 0x0a);
  if (!beginHasLineStart || !beginHasLineEnd || !endHasLineStart || !endHasLineEnd) {
    return { ok: false, reason: "markers-not-full-lines" };
  }
  let endExclusive = endStart + end.length;
  if (bytes[endExclusive] === 0x0d && bytes[endExclusive + 1] === 0x0a) {
    endExclusive += 2;
  } else if (bytes[endExclusive] === 0x0a) {
    endExclusive += 1;
  }
  return {
    ok: true,
    start,
    endExclusive,
    fragment: bytes.subarray(start, endExclusive),
  };
}

function versionGate(installedVersion, { major }) {
  const installed = parseVersion(installedVersion);
  const bundled = parseVersion(SCAFFOLD_VERSION);
  if (!installed || !bundled) {
    return {
      status: "invalid",
      eligible: false,
      upToDate: false,
      message: "Installed or bundled scaffold version is invalid.",
    };
  }
  const comparison = compareVersions(installed, bundled);
  if (comparison === 0) {
    return {
      status: "up-to-date",
      eligible: false,
      upToDate: true,
      message: `The installed scaffold already matches ${SCAFFOLD_VERSION}.`,
    };
  }
  if (comparison > 0) {
    return {
      status: "downgrade-blocked",
      eligible: false,
      upToDate: false,
      message: `Installed scaffold ${installedVersion} is newer than bundled ${SCAFFOLD_VERSION}; downgrade is not supported.`,
    };
  }
  if (installed[0] !== bundled[0] && !major) {
    return {
      status: "major-required",
      eligible: false,
      upToDate: false,
      message: `Upgrade ${installedVersion} -> ${SCAFFOLD_VERSION} crosses a major version; re-run with --major after review.`,
    };
  }
  return {
    status: installed[0] === bundled[0] ? "same-major" : "major-acknowledged",
    eligible: true,
    upToDate: false,
    message: `Mechanical upgrade ${installedVersion} -> ${SCAFFOLD_VERSION} is eligible.`,
  };
}

function basePlan({ target, preview, force, major }) {
  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    command: "upgrade",
    cliVersion: CLI_VERSION,
    scaffoldVersion: SCAFFOLD_VERSION,
    preview,
    writesPerformed: false,
    target: path.resolve(target),
    targetExists: false,
    layout: null,
    installedVersion: null,
    targetVersion: SCAFFOLD_VERSION,
    force,
    major,
    versionGate: {
      status: "unavailable",
      eligible: false,
      upToDate: false,
      message: "Upgrade prerequisites have not been established.",
    },
    operations: [],
    conflicts: [],
    blockers: [],
    warnings: [],
    writtenPaths: [],
    manifestPath: MANIFEST_PATH,
    doctor: null,
    nextAction:
      "After a successful upgrade, run the project bus-check and use an AI session for every reported semantic merge.",
    ready: false,
    upToDate: false,
  };
}

function structuralBlockers(plan, inspection) {
  plan.target = inspection.target;
  plan.targetExists = inspection.exists;
  plan.layout = inspection.installation.layout || inspection.manifest.layout || null;
  plan.installedVersion = inspection.manifest.scaffoldVersion || inspection.installation.version || null;

  if (!inspection.exists) {
    addUnique(plan.blockers, {
      code: "target.not_found",
      path: null,
      message: "Upgrade requires an existing project directory.",
    });
    return;
  }
  if (inspection.installation.state !== "installed") {
    addUnique(plan.blockers, {
      code: `install.${inspection.installation.state.replaceAll("-", "_")}`,
      path: inspection.installation.markerPath,
      message: "Upgrade requires one complete, unambiguous BuildBeat installation.",
    });
  } else if (inspection.installation.namespace !== "buildbeat") {
    addUnique(plan.blockers, {
      code: "install.legacy_namespace",
      path: inspection.installation.markerPath,
      message: "Legacy Solobaton installations require the manual migration or explicitly confirmed re-baselining path.",
    });
  }

  if (inspection.manifest.state !== "present") {
    addUnique(plan.blockers, {
      code: `manifest.${inspection.manifest.state.replaceAll("-", "_")}`,
      path: inspection.manifest.path,
      message: "Upgrade requires one readable canonical schema 2 manifest.",
    });
  } else {
    if (inspection.manifest.path !== MANIFEST_PATH || inspection.manifest.namespace !== "buildbeat") {
      addUnique(plan.blockers, {
        code: "manifest.legacy_namespace",
        path: inspection.manifest.path,
        message: "Mechanical upgrade does not infer ownership from a legacy manifest namespace.",
      });
    }
    if (inspection.manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
      addUnique(plan.blockers, {
        code: "manifest.schema_2_required",
        path: inspection.manifest.path,
        message: "Mechanical upgrade requires manifest schema 2; schema 1 remains diagnostic-only.",
      });
    }
    for (const issue of inspection.manifest.validationIssues || []) {
      addUnique(plan.blockers, {
        code: issue.code,
        path: inspection.manifest.path,
        message: issue.message,
      });
    }
  }

  if (inspection.gitWorktree.state === "not-initialized") {
    addUnique(plan.blockers, {
      code: "git.not_initialized",
      path: null,
      message: "Upgrade requires a target-root Git repository and a clean worktree.",
    });
  } else if (inspection.gitWorktree.state === "dirty") {
    addUnique(plan.blockers, {
      code: "git.dirty",
      path: null,
      message: `The target-root Git worktree has ${inspection.gitWorktree.changes} visible change(s).`,
    });
  } else if (inspection.gitWorktree.state === "unavailable") {
    addUnique(plan.blockers, {
      code: "git.status_unavailable",
      path: null,
      message: "The target-root Git status could not be read safely.",
    });
  }

  if (
    inspection.installation.state === "installed" &&
    inspection.manifest.state === "present" &&
    inspection.manifest.layout !== inspection.installation.layout
  ) {
    addUnique(plan.blockers, {
      code: "manifest.layout_mismatch",
      path: inspection.manifest.path,
      message: "Manifest layout does not match the detected installation layout.",
    });
  }
  if (
    inspection.installation.state === "installed" &&
    inspection.manifest.state === "present" &&
    inspection.installation.version !== inspection.manifest.scaffoldVersion
  ) {
    addUnique(plan.blockers, {
      code: "manifest.version_mismatch",
      path: inspection.manifest.path,
      message: "Manifest scaffoldVersion does not match the installed version marker.",
    });
  }
}

function publicOperation({ action, target, policy, status, current, baseline, candidate, forced = false }) {
  return {
    action,
    target,
    policy,
    status,
    currentSha256: current || null,
    baselineSha256: baseline || null,
    candidateSha256: candidate || null,
    forced,
  };
}

function planFiles(plan, context) {
  const { manifest, rendered, target } = context;
  const candidates = new Map(rendered.files.map((item) => [item.target, item]));
  const manifestEntries = Object.entries(manifest.files).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  for (const [relative, record] of manifestEntries) {
    const candidate = candidates.get(relative) || null;
    if (record.policy === FILE_POLICIES.MERGE_ONLY) {
      addUnique(plan.blockers, {
        code: "manifest.merge_file_unsupported",
        path: relative,
        message: "Schema 2 merge-only ownership is supported only through integrations.gitignore.",
      });
      plan.operations.push(publicOperation({
        action: "preserve",
        target: relative,
        policy: record.policy,
        status: "unsupported-merge-file",
        baseline: record.baselineSha256,
      }));
      candidates.delete(relative);
      continue;
    }

    if (!candidate) {
      plan.operations.push(publicOperation({
        action: "retain",
        target: relative,
        policy: record.policy,
        status: "removed-upstream",
        baseline: record.baselineSha256,
      }));
      plan.warnings.push({
        code: "upgrade.removed_upstream",
        path: relative,
        message: "The path is no longer bundled; it will not be deleted or removed from the manifest.",
      });
      continue;
    }
    candidates.delete(relative);

    if (record.policy === FILE_POLICIES.PROJECT_OWNED) {
      plan.operations.push(publicOperation({
        action: "preserve",
        target: relative,
        policy: record.policy,
        status: candidate.policy === record.policy ? "project-owned" : "policy-change-preserved",
        baseline: record.baselineSha256,
        candidate: candidate.baselineSha256,
      }));
      if (candidate.baselineSha256 !== record.baselineSha256 || candidate.policy !== record.policy) {
        plan.warnings.push({
          code: "upgrade.project_owned_migration",
          path: relative,
          message: "Project-owned content has an upstream candidate; compare it in an AI session and merge semantically if useful.",
        });
      }
      continue;
    }

    if (candidate.policy !== FILE_POLICIES.REPLACE_IF_UNMODIFIED) {
      plan.operations.push(publicOperation({
        action: "preserve",
        target: relative,
        policy: record.policy,
        status: "policy-change-preserved",
        baseline: record.baselineSha256,
        candidate: candidate.baselineSha256,
      }));
      plan.warnings.push({
        code: "upgrade.policy_change",
        path: relative,
        message: "Upstream ownership policy changed; automatic upgrade will not escalate write authority.",
      });
      continue;
    }

    const current = readPathState(target, relative);
    if (current.kind === "unsafe") {
      addUnique(plan.blockers, {
        code: "path.unsafe",
        path: relative,
        message: "Managed path is not a readable regular file; --force cannot cross this boundary.",
      });
      plan.operations.push(publicOperation({
        action: "preserve",
        target: relative,
        policy: record.policy,
        status: "unsafe",
        baseline: record.baselineSha256,
        candidate: candidate.baselineSha256,
      }));
      continue;
    }

    if (current.kind === "file" && current.hash === record.baselineSha256) {
      const unchanged = current.hash === candidate.baselineSha256;
      plan.operations.push(publicOperation({
        action: unchanged ? "keep" : "replace",
        target: relative,
        policy: record.policy,
        status: unchanged ? "already-current" : "baseline-matched",
        current: current.hash,
        baseline: record.baselineSha256,
        candidate: candidate.baselineSha256,
      }));
      if (!unchanged) {
        context.fileWrites.push({
          action: "replace",
          target: relative,
          candidate,
          expectedKind: "file",
          expectedHash: current.hash,
        });
      }
      continue;
    }

    const conflict = {
      code: current.kind === "missing" ? "upgrade.managed_file_missing" : "upgrade.managed_file_changed",
      path: relative,
      message: current.kind === "missing"
        ? "A replace-if-unmodified path is missing."
        : "A replace-if-unmodified path differs from its installed baseline.",
      forceEligible: true,
      resolved: plan.force,
    };
    plan.conflicts.push(conflict);
    plan.operations.push(publicOperation({
      action: plan.force ? "replace" : "preserve",
      target: relative,
      policy: record.policy,
      status: current.kind === "missing" ? "missing-conflict" : "modified-conflict",
      current: current.hash,
      baseline: record.baselineSha256,
      candidate: candidate.baselineSha256,
      forced: plan.force,
    }));
    if (plan.force) {
      context.fileWrites.push({
        action: current.kind === "missing" ? "create" : "replace",
        target: relative,
        candidate,
        expectedKind: current.kind,
        expectedHash: current.hash,
      });
      plan.warnings.push({
        code: "upgrade.force_replace",
        path: relative,
        message: "--force will overwrite or restore this replace-if-unmodified path.",
      });
    }
  }

  for (const [relative, candidate] of [...candidates.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (candidate.policy === FILE_POLICIES.PROJECT_OWNED) {
      plan.operations.push(publicOperation({
        action: "suggest",
        target: relative,
        policy: candidate.policy,
        status: "new-project-owned",
        candidate: candidate.baselineSha256,
      }));
      plan.warnings.push({
        code: "upgrade.project_owned_migration",
        path: relative,
        message: "New project-owned template is available; the CLI will not create it.",
      });
      continue;
    }

    if (candidate.policy !== FILE_POLICIES.REPLACE_IF_UNMODIFIED) {
      addUnique(plan.blockers, {
        code: "upgrade.unsupported_new_policy",
        path: relative,
        message: `New template policy ${candidate.policy} has no mechanical file-write contract.`,
      });
      continue;
    }

    const current = readPathState(target, relative);
    if (current.kind === "missing" && targetParentsSafe(target, relative)) {
      plan.operations.push(publicOperation({
        action: "create",
        target: relative,
        policy: candidate.policy,
        status: "new-managed-path",
        candidate: candidate.baselineSha256,
      }));
      context.fileWrites.push({
        action: "create",
        target: relative,
        candidate,
        expectedKind: "missing",
        expectedHash: null,
      });
      continue;
    }

    const unsafe = current.kind === "unsafe" || !targetParentsSafe(target, relative);
    plan.conflicts.push({
      code: unsafe ? "path.unsafe" : "upgrade.new_path_collision",
      path: relative,
      message: unsafe
        ? "A new managed path has an unsafe parent or destination."
        : "A new managed path collides with project content that has no BuildBeat baseline.",
      forceEligible: false,
      resolved: false,
    });
    plan.operations.push(publicOperation({
      action: "preserve",
      target: relative,
      policy: candidate.policy,
      status: unsafe ? "unsafe" : "new-path-collision",
      current: current.hash,
      candidate: candidate.baselineSha256,
    }));
  }
}

function planGitignore(plan, context) {
  const { manifest, rendered, target } = context;
  const integration = manifest.integrations.gitignore;
  if (integration === null) {
    plan.operations.push(publicOperation({
      action: "preserve",
      target: ".gitignore",
      policy: FILE_POLICIES.MERGE_ONLY,
      status: "unmanaged-integration",
      candidate: rendered.gitignore.baselineSha256,
    }));
    plan.warnings.push({
      code: "upgrade.gitignore_unmanaged",
      path: ".gitignore",
      message: "The manifest owns no gitignore fragment; upgrade will not infer or create one.",
    });
    return;
  }

  const host = readPathState(target, integration.path);
  if (host.kind !== "file") {
    plan.conflicts.push({
      code: "upgrade.gitignore_host_unsafe",
      path: integration.path,
      message: "The owned gitignore fragment has no safe regular host file.",
      forceEligible: false,
      resolved: false,
    });
    plan.operations.push(publicOperation({
      action: "preserve",
      target: integration.path,
      policy: FILE_POLICIES.MERGE_ONLY,
      status: "host-missing-or-unsafe",
      baseline: integration.baselineSha256,
      candidate: rendered.gitignore.baselineSha256,
    }));
    return;
  }

  const extracted = extractOwnedFragment(host.bytes, integration);
  if (!extracted.ok) {
    plan.conflicts.push({
      code: "upgrade.gitignore_markers_invalid",
      path: integration.path,
      message: "Owned gitignore markers are missing, duplicated, mixed, or out of order.",
      forceEligible: false,
      resolved: false,
    });
    plan.operations.push(publicOperation({
      action: "preserve",
      target: integration.path,
      policy: FILE_POLICIES.MERGE_ONLY,
      status: extracted.reason,
      baseline: integration.baselineSha256,
      candidate: rendered.gitignore.baselineSha256,
    }));
    return;
  }

  const currentHash = sha256(extracted.fragment);
  const candidateHash = rendered.gitignore.baselineSha256;
  if (currentHash === integration.baselineSha256) {
    const unchanged = currentHash === candidateHash;
    plan.operations.push(publicOperation({
      action: unchanged ? "keep" : "replace-fragment",
      target: integration.path,
      policy: FILE_POLICIES.MERGE_ONLY,
      status: unchanged ? "already-current" : "baseline-matched",
      current: currentHash,
      baseline: integration.baselineSha256,
      candidate: candidateHash,
    }));
    if (!unchanged) {
      context.gitignoreWrite = {
        path: integration.path,
        expectedHostHash: host.hash,
        bytes: Buffer.concat([
          host.bytes.subarray(0, extracted.start),
          rendered.gitignore.fragment,
          host.bytes.subarray(extracted.endExclusive),
        ]),
        mode: host.mode,
      };
    }
    return;
  }

  plan.conflicts.push({
    code: "upgrade.gitignore_fragment_changed",
    path: integration.path,
    message: "The owned gitignore fragment differs from its baseline.",
    forceEligible: true,
    resolved: plan.force,
  });
  plan.operations.push(publicOperation({
    action: plan.force ? "replace-fragment" : "preserve",
    target: integration.path,
    policy: FILE_POLICIES.MERGE_ONLY,
    status: "modified-conflict",
    current: currentHash,
    baseline: integration.baselineSha256,
    candidate: candidateHash,
    forced: plan.force,
  }));
  if (plan.force) {
    context.gitignoreWrite = {
      path: integration.path,
      expectedHostHash: host.hash,
      bytes: Buffer.concat([
        host.bytes.subarray(0, extracted.start),
        rendered.gitignore.fragment,
        host.bytes.subarray(extracted.endExclusive),
      ]),
      mode: host.mode,
    };
    plan.warnings.push({
      code: "upgrade.force_gitignore",
      path: integration.path,
      message: "--force will replace only the uniquely marked gitignore fragment.",
    });
  }
}

function buildContext(plan, inspection, now) {
  const manifestFilename = relativeFilename(inspection.target, MANIFEST_PATH);
  let manifestBytes;
  let manifest;
  try {
    manifestBytes = readFileSync(manifestFilename);
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    addUnique(plan.blockers, {
      code: "manifest.unreadable",
      path: MANIFEST_PATH,
      message: "The canonical manifest changed or became unreadable during planning.",
    });
    return null;
  }
  const issues = validateManifest(manifest, inspection.target);
  if (issues.length > 0 || manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    for (const issue of issues) {
      addUnique(plan.blockers, { ...issue, path: MANIFEST_PATH });
    }
    return null;
  }
  const rendered = prepareScaffold({
    layout: manifest.layout,
    projectName: inspection.projectName.value,
    now,
  });
  return {
    target: inspection.target,
    inspection,
    manifest,
    manifestHash: sha256(manifestBytes),
    rendered,
    fileWrites: [],
    gitignoreWrite: null,
  };
}

export function buildUpgradePlan({
  target,
  preview = true,
  force = false,
  major = false,
  now = new Date(),
}) {
  const plan = basePlan({ target, preview, force, major });
  let inspection;
  try {
    inspection = inspectProject(target, { includeDependencies: false });
  } catch (error) {
    addUnique(plan.blockers, {
      code: "target.unsafe",
      path: null,
      message: error.message,
    });
    return plan;
  }
  structuralBlockers(plan, inspection);

  if (
    inspection.manifest.state !== "present" ||
    inspection.manifest.path !== MANIFEST_PATH ||
    inspection.manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION ||
    (inspection.manifest.validationIssues || []).length > 0
  ) {
    plan.ready = false;
    return plan;
  }

  const gate = versionGate(inspection.manifest.scaffoldVersion, { major });
  plan.versionGate = gate;
  plan.upToDate = gate.upToDate;
  if (gate.status === "invalid") {
    addUnique(plan.blockers, {
      code: "version.invalid",
      path: MANIFEST_PATH,
      message: gate.message,
    });
  } else if (gate.status === "downgrade-blocked") {
    addUnique(plan.blockers, {
      code: "version.downgrade_blocked",
      path: MANIFEST_PATH,
      message: gate.message,
    });
  } else if (gate.status === "major-required") {
    addUnique(plan.blockers, {
      code: "version.major_required",
      path: MANIFEST_PATH,
      message: gate.message,
    });
  }

  if (gate.upToDate) {
    plan.ready = plan.blockers.length === 0;
    return plan;
  }

  const context = buildContext(plan, inspection, now);
  if (context === null) {
    plan.ready = false;
    return plan;
  }
  const markerRecord = context.manifest.files[inspection.installation.markerPath];
  if (
    inspection.installation.state === "installed" &&
    (!markerRecord || markerRecord.policy !== FILE_POLICIES.REPLACE_IF_UNMODIFIED)
  ) {
    addUnique(plan.blockers, {
      code: "manifest.marker_unmanaged",
      path: inspection.installation.markerPath,
      message: "The installed version marker must be manifest-owned as replace-if-unmodified.",
    });
  }

  planFiles(plan, context);
  planGitignore(plan, context);
  plan.operations.sort((left, right) => left.target.localeCompare(right.target));
  plan.conflicts.sort((left, right) => left.path.localeCompare(right.path));
  plan.warnings.sort((left, right) =>
    (left.path || "").localeCompare(right.path || "") || left.code.localeCompare(right.code),
  );
  plan.ready =
    gate.eligible &&
    plan.blockers.length === 0 &&
    plan.conflicts.every((conflict) => conflict.resolved);
  Object.defineProperty(plan, INTERNAL, { value: context, enumerable: false });
  return plan;
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
    throw new WriteError("path.unsafe", `Unsafe upgrade target path: ${relative}`);
  }
}

function ensureDirectory(directory, createdDirectories) {
  try {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new WriteError("path.unsafe", `Required directory is unsafe: ${directory}`);
    }
    return;
  } catch (error) {
    if (error instanceof WriteError || error.code !== "ENOENT") {
      throw error;
    }
  }
  const parent = path.dirname(directory);
  if (parent === directory) {
    throw new WriteError("path.unsafe", `Cannot create directory: ${directory}`);
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

function ensureTargetParent(target, relative, createdDirectories) {
  assertRelativeTarget(relative);
  ensureDirectory(path.dirname(relativeFilename(target, relative)), createdDirectories);
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

function atomicWrite(filename, bytes, mode, { overwrite, nextTempId }) {
  const parent = path.dirname(filename);
  const basename = path.basename(filename);
  let descriptor = null;
  let temp = null;
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

    if (overwrite) {
      const current = lstatSync(filename);
      if (!current.isFile() || current.isSymbolicLink()) {
        throw new WriteError("path.unsafe", `Upgrade destination is no longer a regular file: ${filename}`);
      }
    } else {
      try {
        lstatSync(filename);
        throw new WriteError("upgrade.preflight_changed", `Upgrade destination appeared: ${filename}`);
      } catch (error) {
        if (error instanceof WriteError || error.code !== "ENOENT") {
          throw error;
        }
      }
    }
    renameSync(temp, filename);
    temp = null;
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

function assertExpectedState(target, write) {
  const current = readPathState(target, write.target);
  if (current.kind !== write.expectedKind || current.hash !== write.expectedHash) {
    throw new WriteError(
      "upgrade.preflight_changed",
      `Managed path changed after planning: ${write.target}`,
    );
  }
  if (!targetParentsSafe(target, write.target)) {
    throw new WriteError("path.unsafe", `Managed path parent became unsafe: ${write.target}`);
  }
}

function preflightExpectations(context) {
  for (const write of context.fileWrites) {
    assertExpectedState(context.target, write);
  }
  if (context.gitignoreWrite) {
    const host = readPathState(context.target, context.gitignoreWrite.path);
    if (host.kind !== "file" || host.hash !== context.gitignoreWrite.expectedHostHash) {
      throw new WriteError(
        "upgrade.preflight_changed",
        `${context.gitignoreWrite.path} changed after planning.`,
      );
    }
  }
  const manifest = readPathState(context.target, MANIFEST_PATH);
  if (manifest.kind !== "file" || manifest.hash !== context.manifestHash) {
    throw new WriteError("upgrade.preflight_changed", "The lifecycle manifest changed after planning.");
  }
}

function rollback({ createdFiles, createdDirectories, backups, nextTempId }) {
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
  for (const backup of [...backups].reverse()) {
    try {
      atomicWrite(backup.filename, backup.bytes, backup.mode, {
        overwrite: true,
        nextTempId,
      });
    } catch (error) {
      failures.push(`${backup.filename}: ${error.code || error.message}`);
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

function nextManifest(context) {
  const manifest = structuredClone(context.manifest);
  manifest.scaffoldVersion = SCAFFOLD_VERSION;
  manifest.cliVersion = CLI_VERSION;
  for (const write of context.fileWrites) {
    manifest.files[write.target] = {
      policy: FILE_POLICIES.REPLACE_IF_UNMODIFIED,
      baselineSha256: write.candidate.baselineSha256,
    };
  }
  if (context.gitignoreWrite) {
    manifest.integrations.gitignore = {
      path: ".gitignore",
      beginMarker: GITIGNORE_BEGIN_MARKER,
      endMarker: GITIGNORE_END_MARKER,
      baselineSha256: context.rendered.gitignore.baselineSha256,
    };
  }
  const issues = validateManifest(manifest, context.target);
  if (issues.length > 0) {
    throw new WriteError(
      "manifest.generated_invalid",
      `Generated manifest is invalid: ${issues.map((issue) => issue.code).join(", ")}`,
    );
  }
  return manifest;
}

export function applyUpgrade(plan, { now = new Date(), faultInjector = null } = {}) {
  if (plan.command !== "upgrade" || plan.preview || plan.writesPerformed) {
    throw new WriteError("write.invalid_plan", "Only a non-preview upgrade plan can be applied.");
  }
  const fresh = buildUpgradePlan({
    target: plan.target,
    preview: false,
    force: plan.force,
    major: plan.major,
    now,
  });
  if (fresh.upToDate && fresh.ready) {
    return fresh;
  }
  if (!fresh.ready || !fresh[INTERNAL]) {
    throw new WriteError(
      "upgrade.preflight_blocked",
      "Upgrade prerequisites, ownership checks, or conflicts changed before apply.",
    );
  }
  const context = fresh[INTERNAL];
  preflightExpectations(context);
  const manifest = nextManifest(context);
  const createdFiles = [];
  const createdDirectories = [];
  const backups = [];
  const writtenPaths = [];
  let tempId = 0;
  const nextTempId = () => {
    tempId += 1;
    return tempId;
  };
  const maybeFault = (phase, relative) => {
    if (typeof faultInjector === "function") {
      faultInjector({ phase, path: relative, writes: writtenPaths.length });
    }
  };

  try {
    for (const write of context.fileWrites) {
      assertExpectedState(context.target, write);
      ensureTargetParent(context.target, write.target, createdDirectories);
      const filename = relativeFilename(context.target, write.target);
      const current = readPathState(context.target, write.target);
      if (current.kind === "file") {
        backups.push({ filename, bytes: current.bytes, mode: current.mode });
      }
      atomicWrite(filename, write.candidate.content, write.candidate.mode, {
        overwrite: current.kind === "file",
        nextTempId,
      });
      if (current.kind === "missing") {
        createdFiles.push(filename);
      }
      writtenPaths.push(write.target);
      maybeFault("file", write.target);
    }

    if (context.gitignoreWrite) {
      const write = context.gitignoreWrite;
      const current = readPathState(context.target, write.path);
      if (current.kind !== "file" || current.hash !== write.expectedHostHash) {
        throw new WriteError(
          "upgrade.preflight_changed",
          `${write.path} changed during the upgrade transaction.`,
        );
      }
      backups.push({ filename: current.filename, bytes: current.bytes, mode: current.mode });
      atomicWrite(current.filename, write.bytes, write.mode, {
        overwrite: true,
        nextTempId,
      });
      writtenPaths.push(write.path);
      maybeFault("gitignore", write.path);
    }

    const manifestFilename = relativeFilename(context.target, MANIFEST_PATH);
    const manifestCurrent = readPathState(context.target, MANIFEST_PATH);
    if (manifestCurrent.kind !== "file" || manifestCurrent.hash !== context.manifestHash) {
      throw new WriteError(
        "upgrade.preflight_changed",
        "The lifecycle manifest changed during the upgrade transaction.",
      );
    }
    backups.push({
      filename: manifestFilename,
      bytes: manifestCurrent.bytes,
      mode: manifestCurrent.mode,
    });
    maybeFault("before-manifest", MANIFEST_PATH);
    atomicWrite(
      manifestFilename,
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
      manifestCurrent.mode,
      { overwrite: true, nextTempId },
    );
    writtenPaths.push(MANIFEST_PATH);
    maybeFault("manifest", MANIFEST_PATH);

    const doctor = runDoctor(context.target);
    return {
      ...fresh,
      preview: false,
      writesPerformed: true,
      writtenPaths,
      doctor,
      nextAction:
        `Run ${fresh.layout === "compact" ? "pm/scripts" : "scripts"}/bus-check.sh --strict; use an AI session for every semantic migration note.`,
      ready: true,
    };
  } catch (error) {
    const rollbackFailures = rollback({
      createdFiles,
      createdDirectories,
      backups,
      nextTempId,
    });
    if (rollbackFailures.length > 0) {
      throw new WriteError(
        "rollback.incomplete",
        `Upgrade failed and rollback was incomplete: ${rollbackFailures.join("; ")}`,
        error,
      );
    }
    if (error instanceof WriteError) {
      throw error;
    }
    throw new WriteError(
      "upgrade.write_failed",
      `Upgrade write failed and was rolled back: ${error.message}`,
      error,
    );
  }
}

export function formatUpgradePlan(plan) {
  const title = plan.writesPerformed
    ? "BuildBeat upgrade complete"
    : `BuildBeat upgrade ${plan.preview ? "dry run" : "write plan"}`;
  const lines = [
    title,
    `Target: ${plan.target}`,
    `Version: ${plan.installedVersion || "unknown"} -> ${plan.targetVersion}`,
    `Version gate: ${plan.versionGate.status}`,
    `Layout: ${plan.layout || "unknown"}`,
    `Force: ${plan.force ? "enabled" : "disabled"}; major transition: ${plan.major ? "acknowledged" : "not acknowledged"}`,
    "",
  ];
  if (plan.upToDate) {
    lines.push("No template upgrade is needed.");
  }
  for (const blocker of plan.blockers) {
    lines.push(`BLOCKER ${blocker.code}${blocker.path ? ` [${blocker.path}]` : ""}: ${blocker.message}`);
  }
  for (const conflict of plan.conflicts) {
    lines.push(
      `${conflict.resolved ? "FORCED" : "CONFLICT"} ${conflict.code} [${conflict.path}]: ${conflict.message}`,
    );
  }
  for (const warning of plan.warnings) {
    lines.push(`WARNING ${warning.code}${warning.path ? ` [${warning.path}]` : ""}: ${warning.message}`);
  }
  if (plan.operations.length > 0) {
    lines.push("", "Mechanical operations:");
    for (const operation of plan.operations) {
      lines.push(
        `- ${operation.action} ${operation.target} (${operation.policy}; ${operation.status})${operation.forced ? " [forced]" : ""}`,
      );
    }
  }
  if (plan.writesPerformed) {
    lines.push(
      "",
      `Written paths: ${plan.writtenPaths.length}`,
      `Doctor: ${plan.doctor?.ok ? "no errors" : `${plan.doctor?.summary.errors ?? "unknown"} error(s)`}`,
      plan.nextAction,
    );
  } else if (plan.conflicts.some((item) => !item.resolved)) {
    lines.push(
      "",
      "No files changed. Open an AI session to compare the current files with the new templates and merge semantically, or review eligible conflicts before --force.",
    );
  } else if (plan.preview) {
    lines.push("", "No files changed. This was a dry run.");
  } else if (!plan.writesPerformed) {
    lines.push("", "No files changed.");
  }
  return lines.join("\n");
}
