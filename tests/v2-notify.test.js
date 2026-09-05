import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  NotifyConfigError,
  buildNotification,
  dispatchNotification,
  loadNotifyConfig,
  nextReply,
  subscribes,
} from "../src/v2/runtime/notify.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat-v2.js");
const PRESET = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function writeNotify(root, body) {
  mkdirSync(join(root, ".buildbeat"), { recursive: true });
  writeFileSync(join(root, ".buildbeat", "notify.yaml"), body);
}

function waitingState(kind = "boundary") {
  return {
    run: { id: "RUN-N", work: "WORK-N", status: "WAITING_HUMAN" },
    pendingHuman: { transition: kind === "final-decision" ? "enter-wait-merge" : "enter-fix", reasons: ["budget exhausted"], kind, subject: { candidate: "abc1234" } },
    workspaces: { "RUN-N": { candidate: "abc1234" } },
    terminal: null,
  };
}

function capturingServer() {
  const received = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      received.push({ url: request.url, body: JSON.parse(body) });
      if (request.url === "/fail") {
        response.statusCode = 500;
      }
      response.end("ok");
    });
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => resolveServer({ server, received, port: server.address().port }));
  });
}

test("notify config is optional, fail-closed on shape, and never allows a URL in Git", () => {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-notify-"));
  assert.equal(loadNotifyConfig(root), null);
  writeNotify(root, ["kind: notify", "version: 1", "channels:", "  - id: owner", "    type: dingtalk", "    urlEnv: BB_HOOK"].join("\n"));
  const config = loadNotifyConfig(root);
  assert.equal(config.channels.length, 1);
  assert.deepEqual(config.channels[0].events, ["HUMAN_REQUESTED", "RUN_TERMINAL", "STALLED"]);
  assert.equal(subscribes(config, "STALLED"), true);
  writeNotify(root, ["kind: notify", "version: 1", "channels:", "  - id: owner", "    type: webhook", "    url: https://example.invalid/hook"].join("\n"));
  assert.throws(() => loadNotifyConfig(root), NotifyConfigError);
  writeNotify(root, ["kind: notify", "version: 1", "channels:", "  - id: owner", "    type: webhook", "    urlEnv: BB_HOOK", "    events:", "      - SOMETHING"].join("\n"));
  assert.throws(() => loadNotifyConfig(root), /unknown event SOMETHING/);
  writeNotify(root, ["kind: notify", "version: 1", "channels:", "  - id: owner", "    type: pager", "    urlEnv: BB_HOOK"].join("\n"));
  assert.throws(() => loadNotifyConfig(root), /type must be one of/);
});

test("nextReply spells out the copyable commands for every kind of wait", () => {
  const boundary = nextReply({ repoLabel: ".", state: waitingState("boundary") });
  assert.equal(boundary.length, 2);
  assert.match(boundary[0], /^buildbeat-v2 approve --repo \. --run RUN-N --transition enter-fix --by <you>/);
  assert.match(boundary[0], /then: resume/);
  assert.match(boundary[1], /^buildbeat-v2 reject --repo \. --run RUN-N/);
  const final = nextReply({ repoLabel: "sub", state: waitingState("final-decision") });
  assert.match(final[0], /enter-wait-merge --by <you>   # merge-ready; merge\/push stay yours/);
  const triage = nextReply({ repoLabel: ".", state: waitingState("finding-triage") });
  assert.equal(triage.length, 4);
  assert.match(triage[0], /findings list --repo \. --work WORK-N/);
  assert.match(triage[1], /findings adjudicate .* --fingerprint <fp> --action accept\|dismiss/);
  assert.deepEqual(nextReply({ repoLabel: ".", state: { run: null, pendingHuman: null } }), []);
});

test("dispatch is fail-open: sends to subscribed channels, skips without env, survives HTTP errors, logs every outcome", async () => {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-notify-"));
  const { server, received, port } = await capturingServer();
  try {
    const config = {
      channels: [
        { id: "ding", type: "dingtalk", urlEnv: "HOOK_DING", events: ["HUMAN_REQUESTED"], keyword: "BuildBeat" },
        { id: "hook", type: "webhook", urlEnv: "HOOK_GENERIC", events: ["HUMAN_REQUESTED", "STALLED"], keyword: "BuildBeat" },
        { id: "broken", type: "webhook", urlEnv: "HOOK_BROKEN", events: ["HUMAN_REQUESTED"], keyword: "BuildBeat" },
        { id: "unset", type: "webhook", urlEnv: "HOOK_UNSET", events: ["HUMAN_REQUESTED"], keyword: "BuildBeat" },
        { id: "quiet", type: "webhook", urlEnv: "HOOK_GENERIC", events: ["RUN_TERMINAL"], keyword: "BuildBeat" },
      ],
    };
    const env = {
      HOOK_DING: `http://127.0.0.1:${port}/ding`,
      HOOK_GENERIC: `http://127.0.0.1:${port}/hook`,
      HOOK_BROKEN: `http://127.0.0.1:${port}/fail`,
    };
    const notification = buildNotification("HUMAN_REQUESTED", { repoLabel: ".", state: waitingState("final-decision") });
    assert.match(notification.title, /RUN-N 等你拍板：enter-wait-merge/);
    const results = await dispatchNotification(config, notification, { repoRoot: root, env });
    const byChannel = Object.fromEntries(results.map((row) => [row.channel, row]));
    assert.equal(byChannel.ding.ok, true);
    assert.equal(byChannel.hook.ok, true);
    assert.equal(byChannel.broken.ok, false);
    assert.match(byChannel.broken.error, /HTTP 500/);
    assert.equal(byChannel.unset.skipped, true);
    assert.equal(byChannel.quiet, undefined, "unsubscribed channel is not contacted");

    const ding = received.find((row) => row.url === "/ding").body;
    assert.equal(ding.msgtype, "text");
    assert.match(ding.text.content, /BuildBeat/);
    assert.match(ding.text.content, /approve --repo \. --run RUN-N --transition enter-wait-merge/);
    const generic = received.find((row) => row.url === "/hook").body;
    assert.equal(generic.kind, "HUMAN_REQUESTED");
    assert.equal(generic.run, "RUN-N");
    assert.equal(generic.candidate, "abc1234");
    assert.ok(Array.isArray(generic.nextReply));

    const log = readFileSync(join(root, ".buildbeat", "runtime", "runs", "RUN-N", "notify.log"), "utf8");
    assert.match(log, /HUMAN_REQUESTED ding SENT HTTP 200/);
    assert.match(log, /HUMAN_REQUESTED broken FAILED HTTP 500/);
    assert.match(log, /HUMAN_REQUESTED unset SKIPPED env HOOK_UNSET not set/);

    // A STALLED notification carries the step facts and a status command only.
    const stalled = buildNotification("STALLED", {
      repoLabel: ".",
      state: { run: { id: "RUN-N", work: "WORK-N", status: "RUNNING" }, pendingHuman: null, terminal: null },
      detail: { step: "verify", attempt: 2, sinceOutput: "21m", elapsed: "40m", threshold: "15m", startedAt: "t0", command: "bash -lc npm test" },
    });
    assert.match(stalled.title, /疑似卡住：verify 已 21m 无输出/);
    assert.match(stalled.reasons.join("\n"), /NOT killed/);
    assert.deepEqual(stalled.nextReply, ["buildbeat-v2 status --repo . --run RUN-N"]);
  } finally {
    server.close();
  }
});

test("a run that stops for a human reaches the configured channel through the CLI", async () => {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-notify-cli-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  writeNotify(root, ["kind: notify", "version: 1", "channels:", "  - id: owner", "    type: webhook", "    urlEnv: BB_TEST_HOOK", "    events:", "      - HUMAN_REQUESTED"].join("\n"));
  writeFileSync(
    join(root, "run-config.yaml"),
    [
      "repo: .",
      "work: WORK-NC",
      "run: RUN-NC",
      `workflow: ${PRESET}`,
      "riskPreset: fast",
      "entry: build",
      "stopAt:",
      "  - review",
      "workers:",
      "  builder:",
      "    command: bash",
      "    args:",
      "      - -lc",
      "      - 'echo done > feature.txt && git add -A && git commit -qm candidate'",
      "  verifier:",
      "    command: bash",
      "    args:",
      "      - -lc",
      "      - test -f feature.txt",
    ].join("\n"),
  );
  const { server, received, port } = await capturingServer();
  try {
    // The child must run asynchronously: a blocking execFileSync would stall
    // this process's event loop and with it the server the child posts to.
    const out = await new Promise((resolveRun, rejectRun) => {
      execFile(
        "node",
        [CLI, "start", "--config", join(root, "run-config.yaml")],
        { encoding: "utf8", env: { ...process.env, BB_TEST_HOOK: `http://127.0.0.1:${port}/hook` } },
        (error, stdout) => (error ? rejectRun(error) : resolveRun(stdout)),
      );
    });
    assert.match(out, /waiting on human: enter-review/);
    assert.match(out, /next \(copy one\):/);
    assert.match(out, /notify HUMAN_REQUESTED -> owner: sent/);
    assert.doesNotMatch(out, new RegExp(root));
    assert.equal(received.length, 1);
    assert.equal(received[0].body.run, "RUN-NC");
    assert.equal(received[0].body.kind, "HUMAN_REQUESTED");
    assert.ok(existsSync(join(root, ".buildbeat", "runtime", "runs", "RUN-NC", "notify.log")));

    // Without the env var the run still completes; the skip is visible.
    const inbox = execFileSync("node", [CLI, "inbox", "--repo", root], { encoding: "utf8" });
    assert.match(inbox, /work WORK-NC:/);
    assert.match(inbox, /RUN-NC \[boundary\] enter-review — waiting \d+s \(since /);
    assert.match(inbox, /next: buildbeat-v2 approve --repo .* --run RUN-NC --transition enter-review/);
  } finally {
    server.close();
  }
});
