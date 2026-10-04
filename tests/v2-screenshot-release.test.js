// Owner decisions before 4.0 (2026-10-04): UI work can require screenshots
// of the real render before the merge decision, and a merged Work closes
// only after the project's own readback of the release has passed.

import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { checkRunConfigShape } from "../src/v2/cli/run-config-check.js";
import { payloadFor } from "../src/v2/adapters/notification-payload.js";
import { screenshotFormat } from "../src/v2/evidence/image.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { deliveryChecks, evaluatePolicies } from "../src/v2/policy/policy.js";
import { buildNotification } from "../src/v2/runtime/notify.js";
import { runsFor } from "../src/v2/runtime/overview.js";
import { runReadback } from "../src/v2/runtime/release.js";
import { tempDir } from "./support/tmp.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");

// A genuine RGB PNG, assembled here with its own CRC so the fixture does
// not depend on the validator under test.
function crc(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
// Builds a PNG whose scanlines match its header, including Adam7 passes;
// `filterByte` and `plte` let a test break exactly one rule.
function makePng(
  width = 2,
  height = 2,
  {
    color = 2,
    depth = 8,
    interlace = 0,
    filterByte = 0,
    plte = color === 3,
    paletteEntries = 2,
    fill = null,
    patchHeader = null,
    extraChunks = [],
    beforeData = [],
  } = {},
) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = depth;
  header[9] = color;
  header[12] = interlace;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  const passes = interlace
    ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]].map(([x0, y0, dx, dy]) => [
        width > x0 ? Math.ceil((width - x0) / dx) : 0,
        height > y0 ? Math.ceil((height - y0) / dy) : 0,
      ])
    : [[width, height]];
  const rows = [];
  for (const [w, h] of passes) {
    if (!w || !h) continue;
    for (let y = 0; y < h; y += 1) {
      // Indexed images point at palette entry 0 unless a test says otherwise.
      const value = fill ?? (color === 3 ? 0x00 : 0x40 + y);
      rows.push(Buffer.from([filterByte]), Buffer.alloc(Math.ceil((w * depth * channels) / 8), value));
    }
  }
  if (patchHeader) patchHeader(header);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    ...(plte ? [pngChunk("PLTE", Buffer.alloc(paletteEntries * 3, 0x7f))] : []),
    ...beforeData,
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    ...extraChunks,
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
const PNG_BYTES = makePng();

function fixture({ verify, review = "", extra = "", workers = ["builder", "verifier", "reviewer", "fixer"] }) {
  const root = tempDir("bb-shot-");
  const git = (...args) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  const dir = join(root, "delivery", "work", "WORK-S");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, ".gitignore"), ".buildbeat/\n.release-broken\n");
  writeFileSync(join(dir, "work.md"), "# Goal\nShip the page.\n");
  writeFileSync(join(root, "shot.png"), PNG_BYTES);
  writeFileSync(
    join(root, "worker.sh"),
    `#!/usr/bin/env bash
set -eu
case "$1" in
 build) echo feature > feature.txt; git add feature.txt; git commit -qm feature ;;
 verify) ${verify} ;;
 fix) echo fixed > fixed.txt; git add fixed.txt; git commit -qm fix ;;
 review) ${review} printf '%s\\n' '{"status":"succeeded","findings":[]}' > "$BUILDBEAT_OUTPUT" ;;
esac
`,
  );
  writeFileSync(
    join(root, "readback.sh"),
    `#!/usr/bin/env bash
if [ -f .release-broken ]; then echo "health: down"; exit 3; fi
echo "token=abc123"
echo "health: ok flag=\${RELEASE_FLAG:-unset} sentinel=\${HOST_SENTINEL:-absent}"
`,
  );
  const plain =
    [
      "repo: ../../..",
      "work: WORK-S",
      "run: RUN-S",
      "allowedPaths:",
      "  - feature.txt",
      "  - fixed.txt",
      "redact:",
      '  - "token=\\\\S+"',
      "workers:",
      ...["builder", "verifier", "reviewer", "fixer"].flatMap((name, i) =>
        workers.includes(name)
          ? [
              `  ${name}:`,
              "    command: bash",
              "    args:",
              "      - worker.sh",
              `      - ${["build", "verify", "review", "fix"][i]}`,
            ]
          : [],
      ),
    ].join("\n") + "\n";
  const config = join(dir, "run-config.yaml");
  writeFileSync(config, plain + extra);
  git("add", ".");
  git("commit", "-qm", "fixture");
  const callWith = (env, ...args) =>
    spawnSync(process.execPath, [CLI, ...args], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
  const call = (...args) => callWith({}, ...args);
  const ok = (...args) => {
    const result = call(...args);
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    return result.stdout;
  };
  const state = (run) =>
    JSON.parse(ok("status", "--repo", ".", "--run", run, "--json")).state;
  return { root, dir, config, plain, git, call, callWith, ok, state };
}

const SCREENSHOT = "requireScreenshot: true\n";
const RENDER = `cp shot.png "$BUILDBEAT_SCREENSHOT_DIR/home.png"`;

test("with requireScreenshot a rendering verify records screenshot evidence the reviewer and the decision card see", () => {
  const f = fixture({ verify: RENDER, review: `printf '%s' "$BUILDBEAT_INPUT" >&2;`, extra: SCREENSHOT });
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  const state = f.state("RUN-S-01");
  assert.equal(state.run.deliveryChecks.requireScreenshot, true);
  assert.equal(state.pendingHuman.transition, "enter-wait-merge");
  const candidate = state.workspaces["RUN-S-01"].candidate;
  const shots = state.evidence.filter((item) => item.kind === "screenshot");
  assert.equal(shots.length, 1);
  assert.equal(shots[0].subject, candidate);
  assert.equal(shots[0].ref, ".buildbeat/runtime/runs/RUN-S-01/screenshots/verify-1/home.png");
  assert.equal(
    shots[0].digest,
    `sha256:${createHash("sha256").update(PNG_BYTES).digest("hex")}`,
  );
  // Outside the candidate: the worktree stays clean.
  assert.equal(
    execFileSync("git", ["-C", join(f.root, ".buildbeat/worktrees/RUN-S-01"), "status", "--porcelain"], { encoding: "utf8" }),
    "",
  );
  const reviewLog = readFileSync(join(f.root, ".buildbeat/runtime/runs/RUN-S-01/logs/review-1.log"), "utf8");
  assert.match(reviewLog, /"screenshots":\[\{"path":"[^"]+home\.png"/);
  assert.match(f.ok("status", "--repo", "."), /screenshot: \.buildbeat\/runtime\/runs\/RUN-S-01\/screenshots\/verify-1\/home\.png sha256:/);
  // The single-run decision card names the same file and digest.
  assert.match(
    f.ok("status", "--repo", ".", "--run", "RUN-S-01"),
    new RegExp(`evidence \\[passed/L2\\] screenshot \\.buildbeat/runtime/runs/RUN-S-01/screenshots/verify-1/home\\.png ${shots[0].digest}`),
  );
  f.ok("decide", "--repo", ".", "--run", "RUN-S-01", "--action", "approve", "--transition", "enter-wait-merge");
  assert.equal(f.state("RUN-S-01").terminal.status, "SUCCEEDED");
});

test("a verify that passes without leaving a screenshot fails as a candidate failure", () => {
  const f = fixture({
    verify: "true",
    extra: `${SCREENSHOT}budgets:\n  maxAttempts:\n    verify: 1\n`,
  });
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  const events = readFileSync(join(f.root, ".buildbeat/runtime/runs/RUN-S-01/events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const finished = events.find((event) => event.type === "STEP_FINISHED" && event.data.step === "verify");
  assert.equal(finished.data.status, "failed");
  assert.equal(finished.data.exitCode, 0);
  assert.equal(finished.data.infra, undefined);
  assert.match(finished.data.reason, /requireScreenshot is on, but verify left no PNG screenshot/);
  assert.match(
    readFileSync(join(f.root, ".buildbeat/runtime/runs/RUN-S-01/logs/verify-1.log"), "utf8"),
    /requirement: requireScreenshot is on/,
  );
  const state = f.state("RUN-S-01");
  assert.equal(state.pendingHuman.kind, "budget");
  assert.equal(state.evidence.filter((item) => item.kind === "screenshot").length, 0);
});

test("the screenshot requirement is frozen with the run", () => {
  const f = fixture({ verify: RENDER, extra: SCREENSHOT });
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  writeFileSync(f.config, f.plain);
  const refused = f.call("run", "--config", f.config);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /safeguards changed/);
});

test("a reused verify carries its screenshots to the new candidate", () => {
  const f = fixture({ verify: RENDER, extra: `${SCREENSHOT}cache:\n  verify: tree\n` });
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  f.ok("run", "--config", f.config, "--new");
  const state = f.state("RUN-S-02");
  const candidate = state.workspaces["RUN-S-02"].candidate;
  const verify = state.evidence.find((item) => item.kind === "command" && item.ref.endsWith("verify-1.log"));
  assert.equal(verify.reused.run, "RUN-S-01");
  const shots = state.evidence.filter((item) => item.kind === "screenshot");
  assert.equal(shots.length, 1);
  assert.equal(shots[0].subject, candidate);
  assert.equal(shots[0].reused.run, "RUN-S-01");
  assert.equal(shots[0].ref, ".buildbeat/runtime/runs/RUN-S-01/screenshots/verify-1/home.png");
  assert.equal(state.pendingHuman.transition, "enter-wait-merge");
});

test("the merge floor requires screenshot evidence for the current candidate when enabled", () => {
  const workDir = tempDir("bb-shot-policy-");
  const policies = deliveryChecks({ requireAcceptance: false, requireScreenshot: true });
  const command = { kind: "command", status: "passed", grade: "L2", subject: "c2", ref: "runs/R/logs/verify-1.log" };
  const review = { kind: "review", status: "passed", grade: "L2", subject: "c2", findings: [] };
  const judge = (evidence) =>
    evaluatePolicies(policies, { type: "transition", appliesTo: "enter-wait-merge" }, {
      state: { evidence },
      candidate: "c2",
      workDir,
    })[0];
  const missing = judge([command, review]);
  assert.notEqual(missing.result, "PASS");
  assert.match(missing.reason, /screenshot/);
  const other = { kind: "screenshot", status: "passed", grade: "L2", subject: "c1", ref: "a.png", source: command.ref };
  assert.notEqual(judge([command, review, other]).result, "PASS");
  const current = { ...other, subject: "c2" };
  assert.equal(judge([command, review, current]).result, "PASS");
  // Only the latest passed verify's screenshots count for the candidate.
  const later = { ...command, ref: "runs/R/logs/verify-2.log" };
  assert.notEqual(judge([command, current, later, review]).result, "PASS");
  assert.equal(
    judge([command, current, later, { ...current, ref: "b.png", source: later.ref }, review]).result,
    "PASS",
  );
  assert.throws(() => deliveryChecks({ requireScreenshot: "yes" }), /invalid delivery safeguards/);
});

test("decision notifications carry screenshot references, never the images", () => {
  const state = {
    run: { id: "RUN-N", work: "WORK-N", status: "WAITING_HUMAN", deliveryChecks: { artifact: "work" } },
    pendingHuman: { transition: "enter-wait-merge", kind: "final-decision", reasons: [], subject: { candidate: "abc1234" } },
    evidence: [
      { kind: "command", status: "passed", subject: "old0000", ref: ".buildbeat/runtime/runs/RUN-N/logs/verify-1.log" },
      { kind: "screenshot", status: "passed", subject: "old0000", ref: "old.png", digest: "sha256:bb", source: ".buildbeat/runtime/runs/RUN-N/logs/verify-1.log" },
      { kind: "command", status: "passed", subject: "abc1234", ref: ".buildbeat/runtime/runs/RUN-N/logs/verify-2.log" },
      { kind: "screenshot", status: "passed", subject: "abc1234", ref: ".buildbeat/runtime/runs/RUN-N/screenshots/verify-2/home.png", digest: "sha256:aa", source: ".buildbeat/runtime/runs/RUN-N/logs/verify-2.log" },
    ],
    workspaces: {},
  };
  const notification = buildNotification("HUMAN_REQUESTED", { repoLabel: ".", state });
  assert.deepEqual(notification.screenshots, [
    { ref: ".buildbeat/runtime/runs/RUN-N/screenshots/verify-2/home.png", digest: "sha256:aa" },
  ]);
  const text = payloadFor({ type: "dingtalk", keyword: "BuildBeat" }, notification).text.content;
  assert.match(text, /screenshot: \.buildbeat\/runtime\/runs\/RUN-N\/screenshots\/verify-2\/home\.png sha256:aa/);
  assert.doesNotMatch(text, /old\.png/);
});

test("run config validates the screenshot switch and the release command", () => {
  const base = { repo: ".", work: "W", run: "R", workers: { verifier: { command: "true" } } };
  assert.deepEqual(checkRunConfigShape({ ...base, requireScreenshot: true, release: { command: "bash", args: ["readback.sh"] } }), []);
  assert.match(checkRunConfigShape({ ...base, requireScreenshot: "yes" }).join("\n"), /requireScreenshot: must be true or false/);
  assert.match(checkRunConfigShape({ ...base, release: { args: ["x"] } }).join("\n"), /release\.command: required/);
  assert.match(checkRunConfigShape({ ...base, release: { command: "x", shell: true } }).join("\n"), /release\.shell/);
});

test("a merged work closes only after a passing release readback", () => {
  const f = fixture({
    verify: "true",
    extra: "release:\n  command: bash\n  args:\n    - readback.sh\n  env:\n    RELEASE_FLAG: on\n",
  });
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  const early = f.call("release", "--config", f.config);
  assert.notEqual(early.status, 0);
  assert.match(early.stderr, /no succeeded run/);
  f.ok("run", "--config", f.config);
  f.ok("decide", "--repo", ".", "--run", "RUN-S-01", "--action", "approve", "--transition", "enter-wait-merge");
  const unmerged = f.call("release", "--config", f.config);
  assert.notEqual(unmerged.status, 0);
  assert.match(unmerged.stderr, /is not contained in HEAD .*merge it first/);
  assert.equal(existsSync(join(f.dir, "releases.jsonl")), false);

  f.git("merge", "-q", "--ff-only", "run/RUN-S-01");
  const overview = () => JSON.parse(f.ok("status", "--repo", ".", "--work", "WORK-S", "--json")).works[0];
  assert.match(overview().next, /release it \(a human action\), then buildbeat release --config delivery\/work\/WORK-S\/run-config\.yaml/);

  // A passing readback followed by a failing one: the latest one decides.
  assert.match(f.ok("release", "--config", f.config, "--note", "first"), /readback passed/);
  writeFileSync(join(f.root, ".release-broken"), "");
  const failed = f.call("release", "--config", f.config, "--note", "after deploy");
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /readback failed \(exit 3\)/);
  assert.match(overview().next, /latest readback failed/);
  const blocked = f.call("decide", "--repo", ".", "--work", "WORK-S", "--action", "close", "--result", "released");
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /latest readback failed/);
  assert.equal(
    readFileSync(join(f.dir, "decisions.jsonl"), "utf8").includes("close-work"),
    false,
  );

  rmSync(join(f.root, ".release-broken"));
  assert.match(
    f.callWith({ HOST_SENTINEL: "leak" }, "release", "--config", f.config, "--note", "after fix").stdout,
    /readback passed \(exit 0\)/,
  );
  const rows = readFileSync(join(f.dir, "releases.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(rows.length, 3);
  const passed = rows[2];
  assert.equal(passed.status, "passed");
  assert.equal(passed.commit, f.git("rev-parse", "HEAD"));
  assert.equal(passed.candidate, f.git("rev-parse", "run/RUN-S-01"));
  assert.equal(passed.note, "after fix");
  assert.equal(passed.grade, "L4");
  // Worker environment rules: release.env reaches it, host variables do not.
  assert.deepEqual(passed.tail, ["<REDACTED>", "health: ok flag=on sentinel=absent"]);
  assert.equal(passed.checkout, passed.commit);
  assert.ok(existsSync(join(f.root, passed.log)));
  assert.match(overview().next, /readback passed/);

  f.ok("decide", "--repo", ".", "--work", "WORK-S", "--action", "close", "--result", "released 1.0", "--by", "owner");
  const decisions = readFileSync(join(f.dir, "decisions.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const closed = decisions.at(-1);
  assert.equal(closed.transition, "close-work");
  assert.equal(closed.subject.readback, passed.digest);
  assert.equal(closed.subject.result, "released 1.0");
  assert.equal(overview().stage, "CLOSED");
  const again = f.call("decide", "--repo", ".", "--work", "WORK-S", "--action", "close", "--result", "again");
  assert.match(again.stderr, /already closed/);
});

test("records written by hand under the without-runtime guide are honoured by the runtime", () => {
  const f = fixture({ verify: "true" });
  // The acceptance line exactly as docs/v2/guide/12-without-runtime.md
  // shows it, with only its placeholders filled in.
  const guide = readFileSync(join(import.meta.dirname, "..", "docs", "v2", "guide", "12-without-runtime.md"), "utf8");
  const example = JSON.parse(guide.match(/```json\n\s*(\{.*\})\n\s*```/)[1]);
  assert.equal(example.transition, "accept-work");
  // Fill in only the placeholders; the literal parts stay as documented.
  example.decisionRef = example.decisionRef.replace("WORK-X", "WORK-S");
  example.by = "owner";
  example.subject.digest = example.subject.digest.replace(
    /<[^<>]*>/,
    createHash("sha256").update(readFileSync(join(f.dir, "work.md"))).digest("hex"),
  );
  writeFileSync(join(f.dir, "decisions.jsonl"), `${JSON.stringify(example)}\n`);
  const ready = JSON.parse(f.ok("status", "--repo", ".", "--work", "WORK-S", "--json")).works[0];
  assert.equal(ready.stage, "READY_TO_RUN");
  f.ok("run", "--config", f.config);
  assert.equal(f.state("RUN-S-01").pendingHuman.transition, "enter-wait-merge");
  f.ok("decide", "--repo", ".", "--run", "RUN-S-01", "--action", "reject", "--reason", "documentation only");
  // A Work that needs no release closes with the guide's close-work line.
  const close = JSON.parse(guide.match(/`(\{[^`]*"close-work"[^`]*\})`/)[1]);
  close.subject.result = "docs only";
  close.by = "owner";
  writeFileSync(
    join(f.dir, "decisions.jsonl"),
    `${readFileSync(join(f.dir, "decisions.jsonl"), "utf8")}${JSON.stringify(close)}\n`,
  );
  const closed = JSON.parse(f.ok("status", "--repo", ".", "--work", "WORK-S", "--json")).works[0];
  assert.equal(closed.stage, "CLOSED");
  assert.match(closed.next, /docs only/);
});

test("images that are empty, mislabelled or symlinked are not screenshots", () => {
  const dir = '"$BUILDBEAT_SCREENSHOT_DIR"';
  const f = fixture({
    verify: [
      `: > ${dir}/empty.png`,
      `printf 'not a jpeg' > ${dir}/bad.jpg`,
      `printf '\\211PNG\\r\\n\\032\\nreal' > ${dir}/target.bin`,
      `ln -s ${dir}/target.bin ${dir}/link.png`,
      `head -c 40 shot.png > ${dir}/header.png`,
      `cp shot.png ${dir}/photo.jpg`,
    ].join("; "),
    extra: `${SCREENSHOT}budgets:\n  maxAttempts:\n    verify: 1\n`,
  });
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  const finished = readFileSync(join(f.root, ".buildbeat/runtime/runs/RUN-S-01/events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((event) => event.type === "STEP_FINISHED" && event.data.step === "verify");
  assert.equal(finished.data.status, "failed");
  assert.match(finished.data.reason, /bad\.jpg \(only PNG screenshots are accepted\)/);
  assert.match(finished.data.reason, /photo\.jpg \(only PNG screenshots are accepted\)/);
  assert.match(finished.data.reason, /empty\.png \(not a decodable PNG\)/);
  assert.match(finished.data.reason, /header\.png \(not a decodable PNG\)/);
  assert.match(finished.data.reason, /link\.png \(not a regular file\)/);
  assert.equal(f.state("RUN-S-01").evidence.filter((item) => item.kind === "screenshot").length, 0);
});

test("approval refuses a screenshot whose file no longer matches its digest", () => {
  const f = fixture({ verify: RENDER, extra: SCREENSHOT });
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  rmSync(join(f.root, ".buildbeat/runtime/runs/RUN-S-01/screenshots/verify-1/home.png"));
  const decisions = readFileSync(join(f.dir, "decisions.jsonl"), "utf8");
  const refused = f.call("decide", "--repo", ".", "--run", "RUN-S-01", "--action", "approve", "--transition", "enter-wait-merge");
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /screenshot evidence no longer matches its file/);
  assert.equal(readFileSync(join(f.dir, "decisions.jsonl"), "utf8"), decisions);
  assert.equal(f.state("RUN-S-01").terminal, null);
});

test("a cached verify whose screenshots are gone runs again", () => {
  const f = fixture({ verify: RENDER, extra: `${SCREENSHOT}cache:\n  verify: tree\n` });
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  rmSync(join(f.root, ".buildbeat/runtime/runs/RUN-S-01/screenshots/verify-1/home.png"));
  f.ok("run", "--config", f.config, "--new");
  const state = f.state("RUN-S-02");
  const verify = state.evidence.find((item) => item.kind === "command" && item.ref.endsWith("verify-1.log"));
  assert.equal(verify.reused, undefined);
  const shots = state.evidence.filter((item) => item.kind === "screenshot");
  assert.equal(shots.length, 1);
  assert.equal(shots[0].ref, ".buildbeat/runtime/runs/RUN-S-02/screenshots/verify-1/home.png");
  assert.equal(shots[0].reused, undefined);
});

test("release records the requested ref and the checkout it ran in, with unique logs", () => {
  const f = fixture({
    verify: "true",
    extra: "release:\n  command: bash\n  args:\n    - readback.sh\n",
  });
  const base = f.git("rev-parse", "HEAD");
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  f.ok("decide", "--repo", ".", "--run", "RUN-S-01", "--action", "approve", "--transition", "enter-wait-merge");
  f.git("merge", "-q", "--ff-only", "run/RUN-S-01");
  f.git("branch", "before", base);
  f.git("branch", "released", "HEAD");
  // The main checkout moves on after the release.
  writeFileSync(join(f.root, "later.txt"), "later\n");
  f.git("add", "later.txt");
  f.git("commit", "-qm", "later");

  const before = f.call("release", "--config", f.config, "--ref", "before");
  assert.notEqual(before.status, 0);
  assert.match(before.stderr, /is not contained in before/);

  const out = f.ok("release", "--config", f.config, "--ref", "released");
  assert.match(out, /readback passed \(exit 0\) for released at/);
  assert.match(out, /the command ran in the main checkout at \w{7}, not at released/);
  const row = readFileSync(join(f.dir, "releases.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)).at(-1);
  assert.equal(row.ref, "released");
  assert.equal(row.commit, f.git("rev-parse", "released"));
  assert.equal(row.checkout, f.git("rev-parse", "HEAD"));

  // A log already named the way a row-count allocator would name the next
  // one belongs to someone else and must survive.
  const logDir = join(f.root, ".buildbeat", "runtime", "releases", "WORK-S");
  const rowsBefore = readFileSync(join(f.dir, "releases.jsonl"), "utf8").split("\n").filter(Boolean).length;
  const foreign = join(logDir, `release-${rowsBefore + 1}.log`);
  writeFileSync(foreign, "someone else's log\n");
  f.ok("release", "--config", f.config, "--ref", "released");
  assert.equal(readFileSync(foreign, "utf8"), "someone else's log\n");
  const latest = readFileSync(join(f.dir, "releases.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)).at(-1);
  assert.notEqual(join(f.root, latest.log), foreign);

  // Two readbacks at the same instant still get their own logs.
  const at = "2026-10-04T00:00:00.000Z";
  const spec = { command: "bash", args: ["readback.sh"] };
  const first = runReadback({ repoRoot: f.root, workId: "WORK-S", spec, runs: runsFor(f.root, "WORK-S"), ts: at });
  const second = runReadback({ repoRoot: f.root, workId: "WORK-S", spec, runs: runsFor(f.root, "WORK-S"), ts: at });
  assert.notEqual(first.log, second.log);
});

test("concurrent readbacks keep separate logs whose digests match their records", async () => {
  const f = fixture({
    verify: "true",
    extra: "release:\n  command: bash\n  args:\n    - -c\n    - sleep 1; echo health ok\n",
  });
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  f.ok("decide", "--repo", ".", "--run", "RUN-S-01", "--action", "approve", "--transition", "enter-wait-merge");
  f.git("merge", "-q", "--ff-only", "run/RUN-S-01");
  // Both processes read the same (empty) releases.jsonl before either
  // appends: an allocator keyed on its row count would hand out one log.
  const launch = () =>
    new Promise((done, fail) => {
      const child = spawn(process.execPath, [CLI, "release", "--config", f.config], { cwd: f.root });
      child.on("error", fail);
      child.on("close", done);
    });
  assert.deepEqual(await Promise.all([launch(), launch()]), [0, 0]);
  const rows = readFileSync(join(f.dir, "releases.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].log, rows[1].log);
  for (const row of rows) {
    const body = readFileSync(join(f.root, row.log), "utf8");
    assert.equal(row.digest, `sha256:${createHash("sha256").update(body, "utf8").digest("hex")}`);
  }
});

test("the screenshot check accepts decodable PNGs and nothing else", () => {
  const png = screenshotFormat("home.PNG");
  assert.equal(screenshotFormat("notes.txt"), null);
  for (const name of ["home.jpg", "home.jpeg", "home.webp", "home.gif"]) {
    assert.equal(screenshotFormat(name).unsupported, true, name);
  }
  assert.equal(png.valid(PNG_BYTES), true);
  assert.equal(png.valid(makePng(3, 1)), true);
  assert.equal(png.valid(makePng(9, 5, { interlace: 1 })), true, "interlaced");
  assert.equal(png.valid(makePng(3, 3, { color: 3, depth: 4 })), true, "palette");
  assert.equal(png.valid(makePng(5, 2, { color: 0, depth: 1 })), true, "1-bit grey");
  assert.equal(png.valid(makePng(4, 4, { color: 6, depth: 16 })), true, "16-bit RGBA");
  assert.equal(png.valid(PNG_BYTES.subarray(0, 8)), false, "signature only");
  assert.equal(png.valid(PNG_BYTES.subarray(0, PNG_BYTES.length - 12)), false, "no IEND");
  const flipped = Buffer.from(PNG_BYTES);
  flipped[flipped.length - 20] ^= 0xff;
  assert.equal(png.valid(flipped), false, "corrupt chunk CRC");
  // Each of these is a well-formed file (valid CRCs) breaking one rule.
  assert.equal(png.valid(makePng(0, 1)), false, "zero width");
  assert.equal(png.valid(makePng(2, 2, { filterByte: 5 })), false, "unknown filter type");
  assert.equal(png.valid(makePng(2, 2, { color: 2, depth: 4 })), false, "illegal depth for RGB");
  assert.equal(png.valid(makePng(2, 2, { color: 3, depth: 8, plte: false })), false, "palette image without PLTE");
  assert.equal(png.valid(makePng(9, 5, { interlace: 0 }).subarray(0, 8)), false);
  assert.equal(png.valid(makePng(3, 2, { patchHeader: (h) => h.writeUInt32BE(3, 4) })), false, "scanlines shorter than the header");
  // Palette rules.
  assert.equal(png.valid(makePng(3, 3, { color: 3, depth: 4, fill: 0x44 })), false, "index outside the palette");
  assert.equal(png.valid(makePng(3, 3, { color: 3, depth: 4, fill: 0x11 })), true, "index inside the palette");
  assert.equal(png.valid(makePng(1, 1, { color: 3, depth: 8, paletteEntries: 257 })), false, "more than 256 entries");
  assert.equal(png.valid(makePng(4, 1, { color: 3, depth: 1, paletteEntries: 3 })), false, "more entries than the bit depth holds");
  assert.equal(png.valid(makePng(2, 2, { color: 0, plte: true })), false, "palette on a greyscale image");
  // Chunk layout a decoder relies on.
  assert.equal(png.valid(makePng(1, 1, { extraChunks: [pngChunk("IHDR", Buffer.alloc(0))] })), false, "second IHDR");
  assert.equal(png.valid(makePng(1, 1, { extraChunks: [pngChunk("ABCD", Buffer.alloc(1))] })), false, "unknown critical chunk");
  assert.equal(png.valid(makePng(1, 1, { extraChunks: [pngChunk("tEXt", Buffer.from("k\0v"))] })), true, "ancillary chunk");
  assert.equal(
    png.valid(makePng(1, 1, { extraChunks: [pngChunk("tEXt", Buffer.from("k\0v")), pngChunk("IDAT", deflateSync(Buffer.alloc(0)))] })),
    false,
    "IDAT not consecutive",
  );
  assert.equal(png.valid(Buffer.concat([PNG_BYTES, Buffer.from("trailing")])), false, "data after IEND");
  // Interlaced images break the same rules.
  assert.equal(png.valid(makePng(9, 5, { interlace: 1, filterByte: 5 })), false, "interlaced, unknown filter");
  assert.equal(png.valid(makePng(9, 5, { patchHeader: (h) => { h[12] = 1; } })), false, "interlaced header, plain data");
  assert.equal(png.valid(makePng(9, 5, { interlace: 1, filterByte: 4 })), true, "interlaced, Paeth filter");
  // Palette indices are judged after reconstruction: Sub turns 1,1,1 into 1,2,3.
  assert.equal(png.valid(makePng(3, 1, { color: 3, depth: 8, filterByte: 1, fill: 1 })), false, "filtered index outside the palette");
  assert.equal(png.valid(makePng(3, 1, { color: 3, depth: 8, filterByte: 1, fill: 1, paletteEntries: 4 })), true, "filtered index inside the palette");
  assert.equal(png.valid(makePng(9, 5, { color: 3, depth: 8, interlace: 1, filterByte: 2, fill: 1 })), false, "interlaced Up filter leaves the palette");
  assert.equal(png.valid(makePng(9, 5, { color: 3, depth: 8, interlace: 1, filterByte: 2, fill: 0 })), true, "interlaced indexed image");
  // A huge declared size is rejected from the header, without allocating.
  const huge = Buffer.from("iVBORw0KGgoAAAANSUhEUn////8AAAABEAYAAADwpu+eAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==", "base64");
  assert.equal(png.valid(huge), false, "width 2^31-1");
  assert.equal(png.valid(makePng(64, 64, { patchHeader: (h) => h.writeUInt32BE(1 << 20, 4) })), false, "data far shorter than the header");
  // Ancillary chunks that change decoding: sizes, values and placement.
  const emptyTrns = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAAHRSTlM2uXDMAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC", "base64");
  assert.equal(png.valid(emptyTrns), false, "empty tRNS");
  assert.equal(png.valid(makePng(2, 2, { beforeData: [pngChunk("tRNS", Buffer.alloc(6))] })), true, "RGB tRNS");
  assert.equal(png.valid(makePng(2, 2, { color: 6, beforeData: [pngChunk("tRNS", Buffer.alloc(6))] })), false, "tRNS on RGBA");
  assert.equal(png.valid(makePng(2, 2, { color: 3, depth: 8, beforeData: [pngChunk("tRNS", Buffer.alloc(3))] })), false, "tRNS longer than the palette");
  assert.equal(png.valid(makePng(2, 2, { beforeData: [pngChunk("gAMA", Buffer.alloc(3))] })), false, "short gAMA");
  assert.equal(png.valid(makePng(2, 2, { beforeData: [pngChunk("sRGB", Buffer.from([9]))] })), false, "sRGB intent 9");
  const gama = pngChunk("gAMA", Buffer.from([0, 0, 0xb1, 0x8f]));
  assert.equal(png.valid(makePng(2, 2, { beforeData: [gama, gama] })), false, "two gAMA");
  assert.equal(png.valid(makePng(2, 2, { color: 3, depth: 8, beforeData: [pngChunk("sRGB", Buffer.from([0]))] })), false, "sRGB after PLTE");
  assert.equal(png.valid(makePng(2, 2, { color: 3, depth: 8, beforeData: [pngChunk("bKGD", Buffer.from([5]))] })), false, "bKGD outside the palette");
  const phys = Buffer.alloc(9);
  phys.writeUInt32BE(2835, 0);
  phys.writeUInt32BE(2835, 4);
  phys[8] = 1;
  assert.equal(
    png.valid(makePng(2, 2, { beforeData: [pngChunk("sRGB", Buffer.from([0])), gama, pngChunk("pHYs", phys)] })),
    true,
    "the chunks browser screenshots carry",
  );
});

test("a screenshot recorded under looser rules carries neither a merge nor a cached verify", () => {
  const f = fixture({ verify: RENDER, extra: `${SCREENSHOT}cache:\n  verify: tree\n` });
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  // A WebP file recorded by an earlier rule set, with a matching digest.
  const ledgerPath = join(f.root, ".buildbeat/runtime/runs/RUN-S-01/events.jsonl");
  const ledger = EventLedger.open(ledgerPath);
  const state = f.state("RUN-S-01");
  const verify = state.evidence.find((item) => item.kind === "command" && item.ref.endsWith("verify-1.log"));
  const webpRef = ".buildbeat/runtime/runs/RUN-S-01/screenshots/verify-1/old.webp";
  writeFileSync(join(f.root, webpRef), "RIFF-not-checked");
  ledger.append({
    type: "EVIDENCE_RECORDED",
    actor: { kind: "kernel", id: "orchestrator" },
    data: {
      evidenceRef: webpRef,
      kind: "screenshot",
      subject: verify.subject,
      digest: `sha256:${createHash("sha256").update("RIFF-not-checked").digest("hex")}`,
      status: "passed",
      grade: "L2",
      source: verify.ref,
      cacheKey: verify.cacheKey,
    },
  });
  const refused = f.call("decide", "--repo", ".", "--run", "RUN-S-01", "--action", "approve", "--transition", "enter-wait-merge");
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /no longer matches its file: .*old\.webp/);
  f.ok("run", "--config", f.config, "--new");
  const next = f.state("RUN-S-02");
  const rerun = next.evidence.find((item) => item.kind === "command" && item.ref.endsWith("verify-1.log"));
  assert.equal(rerun.reused, undefined);
});

test("rejected files are reported even when another screenshot passes", () => {
  const f = fixture({
    verify: `cp shot.png "$BUILDBEAT_SCREENSHOT_DIR/home.png"; cp shot.png "$BUILDBEAT_SCREENSHOT_DIR/photo.jpg"`,
    extra: SCREENSHOT,
  });
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  const finished = readFileSync(join(f.root, ".buildbeat/runtime/runs/RUN-S-01/events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((event) => event.type === "STEP_FINISHED" && event.data.step === "verify");
  assert.equal(finished.data.status, "succeeded");
  assert.deepEqual(finished.data.screenshotsRejected, ["photo.jpg (only PNG screenshots are accepted)"]);
  assert.match(
    readFileSync(join(f.root, ".buildbeat/runtime/runs/RUN-S-01/logs/verify-1.log"), "utf8"),
    /screenshots rejected: photo\.jpg \(only PNG screenshots are accepted\)/,
  );
  assert.equal(f.state("RUN-S-01").evidence.filter((item) => item.kind === "screenshot").length, 1);
});

test("re-verifying the same candidate replaces a screenshot lost in between", () => {
  // The reviewer blocks the first round; with no fixer the run stops, the
  // first screenshot disappears, and the same commit is handed back.
  const f = fixture({
    verify: RENDER,
    review: `case "$BUILDBEAT_INPUT" in *'"attempt":1,'*) printf '%s\\n' '{"status":"succeeded","findings":[{"severity":"P1","summary":"page.txt:1 needs a second look before merging"}]}' > "$BUILDBEAT_OUTPUT"; exit 0 ;; esac;`,
    extra: SCREENSHOT,
    workers: ["builder", "verifier", "reviewer"],
  });
  f.ok("accept", "--repo", ".", "--work", "WORK-S");
  f.ok("run", "--config", f.config);
  const waiting = f.state("RUN-S-01");
  assert.equal(waiting.pendingHuman.transition, "enter-fix");
  const candidate = waiting.workspaces["RUN-S-01"].candidate;
  rmSync(join(f.root, ".buildbeat/runtime/runs/RUN-S-01/screenshots/verify-1/home.png"));
  f.ok("run", "--config", f.config, "--run", "RUN-S-01", "--adopt", candidate, "--by", "driver");
  const state = f.state("RUN-S-01");
  assert.equal(state.pendingHuman.transition, "enter-wait-merge");
  assert.equal(state.workspaces["RUN-S-01"].candidate, candidate);
  // The owner kept the commit as is, so the round-1 finding is dismissed.
  const finding = JSON.parse(f.ok("status", "--repo", ".", "--work", "WORK-S", "--json")).works[0].findings[0];
  f.ok("decide", "--repo", ".", "--work", "WORK-S", "--action", "dismiss", "--fingerprint", finding.fingerprint, "--by", "owner");
  f.ok("decide", "--repo", ".", "--run", "RUN-S-01", "--action", "approve", "--transition", "enter-wait-merge");
  assert.equal(f.state("RUN-S-01").terminal.status, "SUCCEEDED");
});
