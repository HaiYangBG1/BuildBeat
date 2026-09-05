// Outbound notifications (iteration 08, C4): a Run that stops for a human
// should reach that human where they are, not wait for them to open a
// session and ask. Approval waits in the deploy campaign averaged 7–12 hours
// because nothing said "there is something for you".
//
// Discipline: fail-open (a notification failure never touches a run), secrets
// stay out of Git (the webhook URL comes from an env var named in the
// config), payloads carry identifiers and the next reply — never candidate
// content, never logs.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseYamlSubset } from "../engine/yaml-subset.js";

export const NOTIFY_CONFIG = join(".buildbeat", "notify.yaml");
export const NOTIFY_EVENTS = ["HUMAN_REQUESTED", "RUN_TERMINAL", "STALLED"];
const CHANNEL_TYPES = ["webhook", "dingtalk"];

export class NotifyConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotifyConfigError";
  }
}

// Returns null when no config exists. Throws NotifyConfigError on a config
// that exists but is malformed — callers decide whether that is fatal (it is
// not for a run; it is for `doctor`).
export function loadNotifyConfig(repoRoot) {
  const path = join(repoRoot, NOTIFY_CONFIG);
  if (!existsSync(path)) {
    return null;
  }
  const doc = parseYamlSubset(readFileSync(path, "utf8"));
  if (doc.kind !== "notify" || doc.version !== 1) {
    throw new NotifyConfigError(`${NOTIFY_CONFIG}: expected kind: notify / version: 1`);
  }
  if (!Array.isArray(doc.channels) || doc.channels.length === 0) {
    throw new NotifyConfigError(`${NOTIFY_CONFIG}: channels must be a non-empty list`);
  }
  const channels = doc.channels.map((channel, index) => {
    const where = `${NOTIFY_CONFIG} channels[${index}]`;
    if (typeof channel.id !== "string" || channel.id.length === 0) {
      throw new NotifyConfigError(`${where}: id is required`);
    }
    if (!CHANNEL_TYPES.includes(channel.type)) {
      throw new NotifyConfigError(`${where}: type must be one of ${CHANNEL_TYPES.join("|")}`);
    }
    if (typeof channel.urlEnv !== "string" || channel.urlEnv.length === 0) {
      throw new NotifyConfigError(
        `${where}: urlEnv is required (the webhook URL lives in that env var, never in Git)`,
      );
    }
    if (channel.url !== undefined) {
      throw new NotifyConfigError(`${where}: url is not allowed in Git; use urlEnv`);
    }
    const events = channel.events ?? NOTIFY_EVENTS;
    if (!Array.isArray(events) || events.length === 0) {
      throw new NotifyConfigError(`${where}: events must be a non-empty list`);
    }
    for (const event of events) {
      if (!NOTIFY_EVENTS.includes(event)) {
        throw new NotifyConfigError(`${where}: unknown event ${event} (allowed: ${NOTIFY_EVENTS.join("|")})`);
      }
    }
    return { id: channel.id, type: channel.type, urlEnv: channel.urlEnv, events, keyword: channel.keyword ?? "BuildBeat" };
  });
  return { channels };
}

export function subscribes(config, event) {
  return Boolean(config?.channels.some((channel) => channel.events.includes(event)));
}

// The exact commands a human can copy to answer a pending request. Shared by
// status, inbox and notifications so "what do I say now" has one answer.
export function nextReply({ repoLabel, state }) {
  const pending = state.pendingHuman;
  if (!pending || !state.run) {
    return [];
  }
  const runId = state.run.id;
  const lines = [];
  if (pending.kind === "finding-triage") {
    lines.push(`buildbeat-v2 findings list --repo ${repoLabel} --work ${state.run.work}`);
    lines.push(
      `buildbeat-v2 findings adjudicate --repo ${repoLabel} --work ${state.run.work} --fingerprint <fp> --action accept|dismiss --by <you>`,
    );
  }
  lines.push(
    `buildbeat-v2 approve --repo ${repoLabel} --run ${runId} --transition ${pending.transition} --by <you>` +
      (pending.kind === "final-decision" ? "   # merge-ready; merge/push stay yours" : "   # then: resume --config <run-config.yaml>"),
  );
  lines.push(`buildbeat-v2 reject --repo ${repoLabel} --run ${runId} --reason <why> --by <you>`);
  return lines;
}

export function buildNotification(kind, { repoLabel, state, detail = {} }) {
  const run = state.run;
  const base = {
    kind,
    run: run?.id ?? null,
    work: run?.work ?? null,
    status: run?.status ?? null,
    repo: repoLabel,
    at: new Date().toISOString(),
  };
  if (kind === "HUMAN_REQUESTED") {
    const pending = state.pendingHuman;
    return {
      ...base,
      title: `[BuildBeat] ${run.id} 等你拍板：${pending?.transition ?? "?"}`,
      reasons: pending?.reasons ?? [],
      candidate: pending?.subject?.candidate ?? null,
      nextReply: nextReply({ repoLabel, state }),
    };
  }
  if (kind === "RUN_TERMINAL") {
    return {
      ...base,
      title: `[BuildBeat] ${run.id} 结束：${state.terminal?.status ?? run.status}`,
      reasons: state.terminal?.reason ? [state.terminal.reason] : [],
      candidate: state.workspaces?.[run.id]?.candidate ?? null,
      nextReply: [],
    };
  }
  if (kind === "STALLED") {
    return {
      ...base,
      title: `[BuildBeat] ${run.id} 疑似卡住：${detail.step ?? "?"} 已 ${detail.sinceOutput ?? "?"} 无输出`,
      reasons: [
        `step ${detail.step ?? "?"} attempt ${detail.attempt ?? "?"} started ${detail.startedAt ?? "?"}, elapsed ${detail.elapsed ?? "?"}`,
        detail.command ? `worker: ${detail.command}` : "worker: (unknown)",
        `threshold ${detail.threshold ?? "?"}; the process is NOT killed — check status, then decide`,
      ],
      candidate: null,
      nextReply: [`buildbeat-v2 status --repo ${repoLabel} --run ${run.id}`],
    };
  }
  throw new NotifyConfigError(`unknown notification kind: ${kind}`);
}

function renderText(notification) {
  const lines = [notification.title, `work: ${notification.work}  status: ${notification.status}`];
  for (const reason of notification.reasons ?? []) {
    lines.push(`- ${reason}`);
  }
  if (notification.candidate) {
    lines.push(`candidate: ${notification.candidate}`);
  }
  if (notification.nextReply?.length) {
    lines.push("next:");
    for (const line of notification.nextReply) {
      lines.push(`  ${line}`);
    }
  }
  return lines.join("\n");
}

function payloadFor(channel, notification) {
  if (channel.type === "dingtalk") {
    // DingTalk custom robots require a configured keyword in the text; the
    // title carries it (default "BuildBeat").
    const text = renderText(notification);
    return {
      msgtype: "text",
      text: { content: text.includes(channel.keyword) ? text : `${channel.keyword}\n${text}` },
    };
  }
  return { ...notification, text: renderText(notification) };
}

function logLine(repoRoot, runId, line) {
  if (!runId) {
    return;
  }
  try {
    const dir = join(repoRoot, ".buildbeat", "runtime", "runs", runId);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "notify.log"), `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {
    // logging a notification must never fail the caller
  }
}

// Sends to every channel subscribed to the notification kind. Never throws;
// each channel reports ok/skipped/failed. A missing URL env var is a skip
// with a visible reason, not silence.
export async function dispatchNotification(config, notification, { repoRoot, fetchImpl = globalThis.fetch, timeoutMs = 8000, env = process.env } = {}) {
  const results = [];
  for (const channel of config?.channels ?? []) {
    if (!channel.events.includes(notification.kind)) {
      continue;
    }
    const url = env[channel.urlEnv];
    if (!url) {
      results.push({ channel: channel.id, ok: false, skipped: true, error: `env ${channel.urlEnv} not set` });
      logLine(repoRoot, notification.run, `${notification.kind} ${channel.id} SKIPPED env ${channel.urlEnv} not set`);
      continue;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payloadFor(channel, notification)),
        signal: controller.signal,
      });
      const ok = response.ok;
      results.push({ channel: channel.id, ok, status: response.status, error: ok ? null : `HTTP ${response.status}` });
      logLine(repoRoot, notification.run, `${notification.kind} ${channel.id} ${ok ? "SENT" : "FAILED"} HTTP ${response.status}`);
    } catch (error) {
      const message = error?.name === "AbortError" ? `timeout after ${timeoutMs}ms` : error?.message ?? String(error);
      results.push({ channel: channel.id, ok: false, error: message });
      logLine(repoRoot, notification.run, `${notification.kind} ${channel.id} FAILED ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return results;
}
