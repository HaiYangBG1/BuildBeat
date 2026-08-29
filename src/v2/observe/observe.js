// observe v0 runner per docs/v2/RFC-0003-workflow-policy.md §8 (frozen
// semantics): providers produce contract-shaped Evidence (unreachable data is
// unverified, never silence); bands route log → readonly diagnose → intent
// DRAFT enqueue (never auto-executed); dismiss feeds back into drafting.
// Intent drafts and triage verdicts live in the Git plane so deleting
// .buildbeat/runtime/ loses no decision (invariant 23). One invocation runs
// one cycle; periodic operation is host-level (cron/CI) in v0.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { createShellAdapter } from "../adapters/shell.js";
import { INTENT_DRAFT_STATES, TRIAGE_ACTIONS } from "../domain/model.js";
import { collectCommandEvidence } from "../evidence/collector.js";
import { EventLedger } from "../storage/event-ledger.js";
import { loadObserveConfig, severityRank } from "./observe-config.js";
import { OBSERVE_REDUCER } from "./observe-reducer.js";
import { toRepoRef } from "../runtime/repo-ref.js";

const OBSERVE_IDS = { run: "OBSERVE", work: "OBSERVE" };
const KERNEL_ACTOR = { kind: "kernel", id: "observe" };
const HEADER_PREFIX = "<!-- buildbeat-intent ";
const HEADER_SUFFIX = " -->";

export class ObserveError extends Error {
  constructor(message) {
    super(message);
    this.name = "ObserveError";
  }
}

function observeLedgerPath(repoRoot) {
  return join(repoRoot, ".buildbeat", "runtime", "observe", "events.jsonl");
}

export function openObserveLedger(repoRoot) {
  return EventLedger.open(observeLedgerPath(repoRoot), OBSERVE_REDUCER);
}

function intentsDir(repoRoot) {
  return join(repoRoot, "delivery", "observe", "intents");
}

function parseIntentHeader(filePath, text) {
  const firstLine = text.split("\n", 1)[0] ?? "";
  if (!firstLine.startsWith(HEADER_PREFIX) || !firstLine.endsWith(HEADER_SUFFIX)) {
    throw new ObserveError(
      `intent draft ${filePath} has no buildbeat-intent header line; fix or remove the file`,
    );
  }
  const body = firstLine.slice(HEADER_PREFIX.length, -HEADER_SUFFIX.length);
  let header;
  try {
    header = JSON.parse(body);
  } catch {
    throw new ObserveError(`intent draft ${filePath} header is not valid JSON`);
  }
  if (!INTENT_DRAFT_STATES.includes(header.status)) {
    throw new ObserveError(
      `intent draft ${filePath} has unknown status: ${header.status}`,
    );
  }
  return header;
}

export function readIntentDrafts(repoRoot) {
  const dir = intentsDir(repoRoot);
  if (!existsSync(dir)) {
    return [];
  }
  const drafts = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".md")) {
      continue;
    }
    const filePath = join(dir, name);
    const text = readFileSync(filePath, "utf8");
    drafts.push({ file: name, path: filePath, header: parseIntentHeader(filePath, text), text });
  }
  return drafts;
}

function renderHeader(header) {
  return `${HEADER_PREFIX}${JSON.stringify(header)}${HEADER_SUFFIX}`;
}

function writeDraft(filePath, header, body) {
  writeFileSync(filePath, `${renderHeader(header)}\n${body}`, "utf8");
}

function rewriteHeader(draft, header, appendLine) {
  const lines = draft.text.split("\n");
  lines[0] = renderHeader(header);
  let text = lines.join("\n");
  if (appendLine) {
    text = `${text.replace(/\n+$/, "\n")}${appendLine}\n`;
  }
  writeFileSync(draft.path, text, "utf8");
}

function fingerprintFor(provider, status) {
  const key = [provider.id, provider.evidence.kind, provider.evidence.subject, status].join("|");
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
}

function severityFor(provider, status) {
  if (status === "passed") {
    return null;
  }
  return status === "failed" ? provider.severity.failed : provider.severity.unverified;
}

function execCommand({ name, command, args, timeoutMs, repoRoot, input }) {
  const adapter = createShellAdapter({ name, command, args, timeoutMs });
  return adapter.execute({
    step: name,
    worker: name,
    workspacePath: repoRoot,
    input,
    timeoutMs,
  });
}

function recordEvidence({ ledger, config, cycle, provider, execResult, kind, step, grade = "L2" }) {
  const record = collectCommandEvidence({
    runtimeDir: join(config.repoRoot, ".buildbeat", "runtime", "observe"),
    runId: `cycle-${String(cycle).padStart(4, "0")}`,
    step,
    attempt: 1,
    execResult,
    subject: provider.evidence.subject,
    kind,
    grade,
  });
  ledger.append({
    type: "EVIDENCE_RECORDED",
    actor: { kind: "provider", id: provider.id },
    data: {
      evidenceRef: toRepoRef(config.repoRoot, record.location),
      kind: record.kind,
      subject: record.subject,
      digest: record.digest,
      status: record.status,
      grade: record.grade,
      provider: provider.id,
      cycle,
    },
    ...OBSERVE_IDS,
  });
  return record;
}

function draftBody({ provider, severity, record, fingerprint }) {
  return `# Intent 草稿：${provider.id} 在 ${provider.evidence.subject} 上发现 ${provider.evidence.kind} 异常

- 来源 provider：\`${provider.id}\`（severity ${severity}）
- 主题：\`${provider.evidence.subject}\`
- 证据：\`${record.digest}\`（${record.status}；日志见 runtime observe 面，runtime 可删，digest 永续）
- 指纹：\`${fingerprint}\`

## 下一步（人分诊后才会发生任何执行）

- \`fix_now\`：接受后由人工带入 software-delivery Run（本草稿绝不自动执行）；
- \`schedule\`：排期处理；
- \`dismiss\`：驳回——同指纹在严重度升级前不再重复入队。

分诊命令：

\`\`\`
node src/v2/cli/run.js observe triage --repo <repo> --intent <本文件相对路径> --action fix_now|schedule|dismiss --by <name>
\`\`\`
`;
}

function handleIntentBand({ ledger, config, cycle, provider, severity, record, fingerprint, now }) {
  const dir = intentsDir(config.repoRoot);
  const drafts = readIntentDrafts(config.repoRoot);
  const existing = drafts.find((draft) => draft.header.fingerprint === fingerprint);
  if (existing) {
    const header = existing.header;
    if (header.status === "dismissed") {
      if (severityRank(severity) <= severityRank(header.dismissedSeverity ?? header.severity)) {
        return { outcome: "suppressed", intentRef: relativeIntentRef(config.repoRoot, existing.path) };
      }
      const reopened = {
        ...header,
        status: "draft",
        severity,
        evidenceDigest: record.digest,
        updated: now,
      };
      delete reopened.dismissedSeverity;
      delete reopened.triage;
      rewriteHeader(
        existing,
        reopened,
        `> ${now}：严重度升级为 ${severity}（此前以 ${header.dismissedSeverity ?? header.severity} 被 dismiss），草稿重新开启。`,
      );
      const intentRef = relativeIntentRef(config.repoRoot, existing.path);
      ledger.append({
        type: "INTENT_DRAFTED",
        actor: KERNEL_ACTOR,
        data: { intentRef, provider: provider.id, severity, fingerprint },
        ...OBSERVE_IDS,
      });
      return { outcome: "reopened", intentRef };
    }
    if (severityRank(severity) > severityRank(header.severity)) {
      rewriteHeader(existing, { ...header, severity, evidenceDigest: record.digest, updated: now });
    }
    return { outcome: "already-queued", intentRef: relativeIntentRef(config.repoRoot, existing.path) };
  }
  mkdirSync(dir, { recursive: true });
  const fileName = `INTENT-${fingerprint}.md`;
  const filePath = join(dir, fileName);
  const header = {
    id: fingerprint,
    fingerprint,
    provider: provider.id,
    kind: provider.evidence.kind,
    subject: provider.evidence.subject,
    severity,
    status: "draft",
    evidenceDigest: record.digest,
    created: now,
    updated: now,
  };
  writeDraft(filePath, header, draftBody({ provider, severity, record, fingerprint }));
  const intentRef = relativeIntentRef(config.repoRoot, filePath);
  ledger.append({
    type: "INTENT_DRAFTED",
    actor: KERNEL_ACTOR,
    data: { intentRef, provider: provider.id, severity, fingerprint },
    ...OBSERVE_IDS,
  });
  return { outcome: "drafted", intentRef };
}

function relativeIntentRef(repoRoot, filePath) {
  return filePath.startsWith(repoRoot) ? filePath.slice(repoRoot.length + 1) : filePath;
}

export function runObserveCycle({ configPath, now = new Date().toISOString() }) {
  const config = loadObserveConfig(configPath);
  const ledger = openObserveLedger(config.repoRoot);
  const cycle = ledger.state.cycles + 1;
  ledger.append({
    type: "OBSERVE_CYCLE_STARTED",
    actor: KERNEL_ACTOR,
    data: { cycle, configDigest: config.configDigest },
    ...OBSERVE_IDS,
  });
  const results = [];
  for (const provider of config.providers) {
    const execResult = execCommand({
      name: `provider:${provider.id}`,
      command: provider.command,
      args: provider.args,
      timeoutMs: provider.timeoutMs ?? 600000,
      repoRoot: config.repoRoot,
      input: { provider: provider.id, cycle },
    });
    const record = recordEvidence({
      ledger,
      config,
      cycle,
      provider,
      execResult,
      kind: provider.evidence.kind,
      step: provider.id,
    });
    const severity = severityFor(provider, record.status);
    const result = {
      provider: provider.id,
      status: record.status,
      severity,
      bands: [],
      intent: null,
    };
    if (severity !== null) {
      const fingerprint = fingerprintFor(provider, record.status);
      for (const band of config.bands) {
        if (severityRank(severity) < severityRank(band.minSeverity)) {
          continue;
        }
        ledger.append({
          type: "BAND_TRIGGERED",
          actor: KERNEL_ACTOR,
          data: { provider: provider.id, band: band.level, severity, fingerprint },
          ...OBSERVE_IDS,
        });
        result.bands.push(band.level);
        if (band.level === "diagnose") {
          const diagnoseResult = provider.diagnose
            ? execCommand({
                name: `diagnose:${provider.id}`,
                command: provider.diagnose.command,
                args: provider.diagnose.args,
                timeoutMs: provider.diagnose.timeoutMs ?? 600000,
                repoRoot: config.repoRoot,
                input: { provider: provider.id, cycle, band: "diagnose" },
              })
            : {
                adapter: "observe",
                command: "(no diagnose command configured)",
                exitCode: null,
                signal: null,
                stdout: "",
                stderr: "diagnose band triggered but the provider configures no diagnose command",
                timedOut: false,
                spawnError: "no diagnose command configured",
                startedAt: now,
                finishedAt: now,
              };
          recordEvidence({
            ledger,
            config,
            cycle,
            provider,
            execResult: diagnoseResult,
            kind: "diagnosis",
            step: `${provider.id}-diagnose`,
          });
        }
        if (band.level === "intent") {
          result.intent = handleIntentBand({
            ledger,
            config,
            cycle,
            provider,
            severity,
            record,
            fingerprint,
            now,
          });
        }
      }
    }
    results.push(result);
  }
  ledger.append({
    type: "OBSERVE_CYCLE_FINISHED",
    actor: KERNEL_ACTOR,
    data: { cycle, providersRun: config.providers.length },
    ...OBSERVE_IDS,
  });
  return {
    cycle,
    ledgerPath: ledger.path,
    ledgerRef: toRepoRef(config.repoRoot, ledger.path),
    results,
    state: ledger.state,
  };
}

export function triageIntent({ repoRoot, intentRef, action, by = "unknown", note, now = new Date().toISOString() }) {
  if (!TRIAGE_ACTIONS.includes(action)) {
    throw new ObserveError(`action must be one of ${TRIAGE_ACTIONS.join("|")}, got: ${action}`);
  }
  const root = resolve(repoRoot);
  const candidatePaths = [
    resolve(root, intentRef),
    join(intentsDir(root), intentRef),
    join(intentsDir(root), `${intentRef}.md`),
  ];
  const filePath = candidatePaths.find((path) => existsSync(path));
  if (!filePath) {
    throw new ObserveError(`intent draft not found: ${intentRef}`);
  }
  const text = readFileSync(filePath, "utf8");
  const header = parseIntentHeader(filePath, text);
  const nextStatus = action === "fix_now" ? "accepted" : action === "schedule" ? "scheduled" : "dismissed";
  const nextHeader = {
    ...header,
    status: nextStatus,
    updated: now,
    triage: { action, by, at: now, ...(note ? { note } : {}) },
    ...(action === "dismiss" ? { dismissedSeverity: header.severity } : {}),
  };
  if (action !== "dismiss") {
    delete nextHeader.dismissedSeverity;
  }
  rewriteHeader({ path: filePath, text }, nextHeader);
  const ledger = openObserveLedger(root);
  ledger.append({
    type: "TRIAGE_RECORDED",
    actor: { kind: "human", id: by },
    data: {
      intentRef: relativeIntentRef(root, filePath),
      action,
      fingerprint: header.fingerprint,
    },
    ...OBSERVE_IDS,
  });
  return {
    intentRef: relativeIntentRef(root, filePath),
    status: nextStatus,
    fingerprint: header.fingerprint,
    suggestion:
      action === "fix_now"
        ? "accepted: start a software-delivery run for this intent (run.js start --config <run-config.yaml>) — the draft never executes itself"
        : null,
  };
}

export function observeStatus({ repoRoot }) {
  const root = resolve(repoRoot);
  const ledger = openObserveLedger(root);
  const drafts = readIntentDrafts(root);
  return {
    ledgerPath: ledger.path,
    corruption: ledger.corruption,
    cycles: ledger.state.cycles,
    providers: ledger.state.providers,
    intents: drafts.map((draft) => ({
      file: relativeIntentRef(root, draft.path),
      ...draft.header,
    })),
  };
}
