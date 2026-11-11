// UI work can require screenshots of the real render before the merge
// decision, and a work with a release closes only after the project's own
// readback of that release has passed.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { loadReviewConfig } from "../src/v2/cli/review-config.js";
import { screenshotFormat } from "../src/v2/evidence/image.js";
import { mergeChecks } from "../src/v2/policy/policy.js";
import { approveReview } from "../src/v2/runtime/decisions.js";
import { runsFor } from "../src/v2/runtime/overview.js";
import { closeWork, runReadback } from "../src/v2/runtime/release.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import {
  CLI, PROJECT_CONFIG, approved, cli, commit, fixture, git, jsonl, reviewWith, statusRow, worker, write, yaml,
} from "./support/review.js";
import { tempDir } from "./support/tmp.js";

const WORK = "WORK-S";


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
    // Adam7 skips empty passes; a plain image keeps its rows even at width
    // 0, so a zero-width fixture still carries one filter byte per row.
    if (interlace && (!w || !h)) continue;
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

// A repository with one accepted work and a commit of it to review.
function uiWork(options = {}) {
  const made = fixture({ prefix: "bb-shot-", work: WORK, ...options });
  const sha = commit(made.root, `add the page\n\nWork: ${WORK}`, { "src/feature.txt": "page\n" });
  return { ...made, sha };
}
const SHOTS = { checks: { requireScreenshot: true } };
// A verifier that passes after `leave` put files into the screenshot
// directory it was given.
const rendering = (leave = (dir) => writeFileSync(join(dir, "home.png"), PNG_BYTES)) =>
  worker(({ extraEnv }) => {
    leave(extraEnv.BUILDBEAT_SCREENSHOT_DIR);
    return {};
  });
const runFile = (root, run, ...path) => join(root, ".buildbeat", "runtime", "runs", run, ...path);
const events = (root, run) =>
  readFileSync(runFile(root, run, "events.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const verifyFinished = (root, run) =>
  events(root, run).find((event) => event.type === "STEP_FINISHED" && event.data.step === "verify");
const screenshots = (state) => state.evidence.filter((item) => item.kind === "screenshot");
const approve = (root, sha) => approveReview(root, WORK, { candidate: sha, by: "owner", as: "human" });
const call = (root, args, env) => cli(args, { cwd: root, env });
function ok(root, args) {
  const result = call(root, args);
  assert.equal(result.status, 0, result.all);
  return result.out;
}

test("with requireScreenshot a rendering verify records screenshot evidence the reviewer and the decision card see", () => {
  const { root } = fixture({
    prefix: "bb-shot-",
    work: WORK,
    workConfig: yaml([
      "requireScreenshot: true",
      "workers:",
      "  verifier:", "    command: sh", "    args:", "      - tools/render.sh",
      "  reviewer:", "    command: sh", "    args:", "      - tools/show-input.sh",
    ]),
  });
  const sha = commit(root, `add the page\n\nWork: ${WORK}`, {
    "tools/shot.png": PNG_BYTES,
    "tools/render.sh": 'cp tools/shot.png "$BUILDBEAT_SCREENSHOT_DIR/home.png"\n',
    // Prints what it was handed, then reports no findings.
    "tools/show-input.sh": 'printf \'%s\' "$BUILDBEAT_INPUT" >&2\nprintf \'{"findings":[]}\' > "$BUILDBEAT_OUTPUT"\n',
  });
  assert.match(ok(root, ["check", "--repo", ".", "--work", WORK]), /^ {2}merge checks: .*, screenshots from verify$/m);
  ok(root, ["review", "--repo", ".", "--work", WORK]);

  const state = JSON.parse(ok(root, ["status", "--repo", ".", "--run", "RUN-S-01", "--json"])).state;
  assert.equal(state.run.deliveryChecks.requireScreenshot, true);
  assert.equal(state.pendingHuman.transition, "enter-wait-merge");
  const shots = screenshots(state);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].subject, sha);
  assert.equal(shots[0].ref, ".buildbeat/runtime/runs/RUN-S-01/screenshots/verify-1/home.png");
  assert.equal(shots[0].digest, `sha256:${createHash("sha256").update(PNG_BYTES).digest("hex")}`);
  // The reviewer was shown the file.
  assert.match(readFileSync(runFile(root, "RUN-S-01", "logs", "review-1.log"), "utf8"), /"screenshots":\[\{"path":"[^"]+home\.png"/);
  assert.match(ok(root, ["status", "--repo", "."]), /screenshot: \.buildbeat\/runtime\/runs\/RUN-S-01\/screenshots\/verify-1\/home\.png sha256:/);
  // The single-run decision card names the same file and digest.
  assert.match(
    ok(root, ["status", "--repo", ".", "--run", "RUN-S-01"]),
    new RegExp(`evidence \\[passed/L2\\] screenshot \\.buildbeat/runtime/runs/RUN-S-01/screenshots/verify-1/home\\.png ${shots[0].digest}`),
  );
  ok(root, ["decide", "--repo", ".", "--work", WORK, "--action", "approve", "--candidate", sha, "--by", "owner", "--as", "human"]);
  assert.equal(statusRow(root, WORK).latest.status, "SUCCEEDED");
});

test("a verify that passes without leaving a screenshot fails as a failure of the commit", () => {
  const { root } = uiWork();
  const result = reviewWith(root, WORK, SHOTS);
  assert.equal(result.state.terminal.status, "FAILED");
  assert.equal(result.state.terminal.reason, "verify failed (exit 0): requireScreenshot is on, but verify left no PNG screenshot in BUILDBEAT_SCREENSHOT_DIR");
  assert.equal(result.state.steps.review, undefined, "nothing was reviewed");
  const finished = verifyFinished(root, result.runId);
  assert.equal(finished.data.status, "failed");
  assert.equal(finished.data.exitCode, 0);
  assert.equal(finished.data.infra, undefined);
  assert.match(finished.data.reason, /requireScreenshot is on, but verify left no PNG screenshot/);
  assert.match(readFileSync(runFile(root, result.runId, "logs", "verify-1.log"), "utf8"), /requirement: requireScreenshot is on/);
  assert.equal(screenshots(result.state).length, 0);
});

test("the merge checks require screenshot evidence for the current commit when enabled", () => {
  const workDir = tempDir("bb-shot-policy-");
  const command = { kind: "command", status: "passed", grade: "L2", subject: "c2", ref: "runs/R/logs/verify-1.log" };
  const review = { kind: "review", status: "passed", grade: "L2", subject: "c2", findings: [] };
  const judge = (evidence, checks = { requireAcceptance: false, requireScreenshot: true }) =>
    mergeChecks(checks, { state: { evidence }, candidate: "c2", workDir })[0];
  const missing = judge([command, review]);
  assert.notEqual(missing.result, "PASS");
  assert.match(missing.reason, /screenshot/);
  assert.equal(judge([command, review], { requireAcceptance: false }).result, "PASS", "not asked for, not required");
  const other = { kind: "screenshot", status: "passed", grade: "L2", subject: "c1", ref: "a.png", source: command.ref };
  assert.notEqual(judge([command, review, other]).result, "PASS");
  const current = { ...other, subject: "c2" };
  assert.equal(judge([command, review, current]).result, "PASS");
  // Only the latest passed verify's screenshots count for the commit.
  const later = { ...command, ref: "runs/R/logs/verify-2.log" };
  assert.notEqual(judge([command, current, later, review]).result, "PASS");
  assert.equal(
    judge([command, current, later, { ...current, ref: "b.png", source: later.ref }, review]).result,
    "PASS",
  );
});

test("the run config validates the screenshot switch and the release command", () => {
  const root = tempDir("bb-shot-config-");
  const load = (lines) => {
    write(root, "delivery/run-config.yaml", PROJECT_CONFIG + yaml(lines));
    return loadReviewConfig(root);
  };
  const valid = load(["requireScreenshot: true", "release:", "  command: bash", "  args:", "    - readback.sh"]);
  assert.equal(valid.deliveryChecks.requireScreenshot, true);
  assert.equal(valid.release.command, "bash");
  assert.deepEqual(valid.release.args, ["readback.sh"]);
  assert.equal(Object.hasOwn(load([]).deliveryChecks, "requireScreenshot"), false);
  assert.equal(load([]).release, null);
  assert.throws(() => load(["requireScreenshot: yes please"]), /requireScreenshot: must be true or false/);
  assert.throws(() => load(["release:", "  args:", "    - x"]), /release\.command: required/);
  assert.throws(() => load(["release:", "  command: x", "  shell: true"]), /release\.shell: unknown key/);
});

const READBACK = [
  "#!/usr/bin/env bash",
  'if [ -f .release-broken ]; then echo "health: down"; exit 3; fi',
  'echo "token=abc123"',
  'echo "health: ok flag=${RELEASE_FLAG:-unset} sentinel=${HOST_SENTINEL:-absent}"',
  "",
].join("\n");
const CHANGE = { "src/feature.txt": "page\n", "readback.sh": READBACK };
const RELEASE = ["release:", "  command: bash", "  args:", "    - readback.sh"];
const release = (extra = []) => ["release", "--repo", ".", "--work", WORK, ...extra];
const close = (extra = []) => ["decide", "--repo", ".", "--work", WORK, "--action", "close", "--by", "owner", "--as", "human", ...extra];
const overview = (root) => JSON.parse(ok(root, ["status", "--repo", ".", "--work", WORK, "--json"])).works[0];

test("a work with a release closes only after a passing release readback", () => {
  const { root } = fixture({
    prefix: "bb-shot-",
    work: WORK,
    // Its own release: section is what makes the work one that has a release.
    workConfig: yaml(["redact:", '  - "token=\\\\S+"', ...RELEASE, "  env:", "    RELEASE_FLAG: on"]),
  });
  const dir = join(root, "delivery", "work", WORK);
  const { sha } = approved(root, WORK, CHANGE);
  const merged = overview(root);
  assert.equal(merged.stage, "MERGED");
  assert.match(merged.next, /^candidate \w{7} \(RUN-S-01\) is on main; release it \(a human action\), then buildbeat release --repo \. --work WORK-S; then write delivery\/work\/WORK-S\/result\.md, /);
  const unread = call(root, close(["--result", "released"]));
  assert.equal(unread.status, 1);
  assert.match(unread.err, /WORK-S has no readback; run buildbeat release --repo <path> --work WORK-S after the release first/);

  // A passing readback followed by a failing one: the latest one decides.
  assert.match(ok(root, release(["--note", "first"])), /readback passed/);
  writeFileSync(join(root, ".release-broken"), "");
  const failed = call(root, release(["--note", "after deploy"]));
  assert.equal(failed.status, 1);
  assert.match(failed.out, /readback failed \(exit 3\)/);
  assert.match(overview(root).next, /latest readback failed/);
  const blocked = call(root, close(["--result", "released"]));
  assert.equal(blocked.status, 1);
  assert.match(blocked.err, /latest readback failed/);
  assert.equal(readFileSync(join(dir, "decisions.jsonl"), "utf8").includes("close-work"), false);

  rmSync(join(root, ".release-broken"));
  assert.match(call(root, release(["--note", "after fix"]), { HOST_SENTINEL: "leak" }).out, /readback passed \(exit 0\)/);
  const rows = jsonl(root, WORK, "releases.jsonl");
  assert.equal(rows.length, 3);
  const passed = rows[2];
  assert.equal(passed.status, "passed");
  assert.equal(passed.commit, git(root, ["rev-parse", "HEAD"]));
  assert.equal(passed.run, "RUN-S-01");
  assert.equal(passed.candidate, sha);
  assert.equal(passed.note, "after fix");
  assert.equal(passed.grade, "L4");
  // Worker environment rules: release.env reaches it, host variables do not.
  assert.deepEqual(passed.tail, ["<REDACTED>", "health: ok flag=on sentinel=absent"]);
  assert.equal(passed.checkout, passed.commit);
  assert.ok(existsSync(join(root, passed.log)));
  assert.doesNotMatch(readFileSync(join(root, passed.log), "utf8"), /abc123/);
  assert.match(overview(root).next, /readback passed/);

  // A passing readback is not enough on its own: the work closes with its
  // result page, and the readback stays bound to the close decision.
  const pageless = call(root, close(["--result", "released 1.0"]));
  assert.equal(pageless.status, 1);
  assert.match(pageless.err, /closing a work needs delivery\/work\/WORK-S\/result\.md \(template: templates\/v2\/result\.example\.md\)/);
  writeFileSync(join(dir, "result.md"), "# WORK-S result\n\nReleased 1.0 and read back.\n");
  ok(root, close(["--result", "released 1.0"]));
  const closed = jsonl(root, WORK, "decisions.jsonl").at(-1);
  assert.equal(closed.transition, "close-work");
  assert.equal(closed.subject.readback, passed.digest);
  assert.equal(closed.subject.candidate, sha);
  assert.equal(closed.subject.result, "released 1.0");
  assert.match(closed.subject.resultDigest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(closed.subject.promotions, []);
  assert.equal(overview(root).stage, "CLOSED");
  const again = call(root, close(["--result", "again"]));
  assert.match(again.err, /already closed/);
});

test("the project's release: is only the default command; a readback, once recorded, must pass before the work closes", () => {
  const { root } = fixture({ prefix: "bb-shot-", work: WORK, projectConfig: PROJECT_CONFIG + yaml(RELEASE) });
  const dir = join(root, "delivery", "work", WORK);
  const { sha } = approved(root, WORK, CHANGE);
  // The work has no release: of its own, so nothing asks it for a readback.
  const merged = statusRow(root, WORK);
  assert.equal(merged.stage, "MERGED");
  assert.match(merged.next, /^merged; close out: write delivery\/work\/WORK-S\/result\.md, then buildbeat decide /);

  writeFileSync(join(dir, "result.md"), "# WORK-S result\n\nReleased and read back.\n");
  const spec = loadReviewConfig(root, WORK).release;
  const readback = () => runReadback({ repoRoot: root, workId: WORK, spec, runs: runsFor(root, WORK) });
  const closeIt = () => closeWork({ repoRoot: root, workId: WORK, runs: runsFor(root, WORK), by: "owner", as: "human" });
  // It was read back with the project's command and that failed: the record
  // is there now, and the latest one decides.
  writeFileSync(join(root, ".release-broken"), "");
  assert.equal(readback().status, "failed");
  assert.throws(closeIt, /the latest readback failed \(exit 3 at /);
  assert.match(statusRow(root, WORK).next, /^latest readback failed @ \S+ \(exit 3\); fix the release, then buildbeat release /);

  rmSync(join(root, ".release-broken"));
  const passed = readback();
  assert.equal(passed.status, "passed");
  const row = closeIt();
  assert.equal(row.subject.readback, passed.digest);
  assert.equal(row.subject.candidate, sha);
  assert.equal(statusRow(root, WORK).stage, "CLOSED");
});

test("records written by hand under the without-runtime guide are honoured by the runtime", () => {
  const { root } = fixture({ prefix: "bb-shot-", work: WORK, accept: false });
  const dir = join(root, "delivery", "work", WORK);
  const sha256 = (name) => createHash("sha256").update(readFileSync(join(dir, name))).digest("hex");
  // The acceptance line exactly as docs/v2/guide/12-without-runtime.md
  // shows it, with only its placeholders filled in.
  const guide = readFileSync(join(import.meta.dirname, "..", "docs", "v2", "guide", "12-without-runtime.md"), "utf8");
  const example = JSON.parse(guide.match(/```json\n\s*(\{.*\})\n\s*```/)[1]);
  assert.equal(example.transition, "accept-work");
  example.decisionRef = example.decisionRef.replace("WORK-X", WORK);
  example.by = "owner";
  example.subject.digest = example.subject.digest.replace(/<[^<>]*>/, sha256("work.md"));
  writeFileSync(join(dir, "decisions.jsonl"), `${JSON.stringify(example)}\n`);
  assert.equal(statusRow(root, WORK).stage, "READY_TO_RUN");
  // The approval checks the acceptance again, and takes the hand-written one.
  approved(root, WORK);
  assert.equal(statusRow(root, WORK).stage, "MERGED");

  // A work that needs no release closes with the guide's close-work line,
  // bound to its result page by the page's SHA-256.
  writeFileSync(join(dir, "result.md"), "# WORK-S result\n\nDocs only.\n");
  const closeLine = JSON.parse(guide.match(/`(\{[^`]*"close-work"[^`]*\})`/)[1]);
  closeLine.subject.result = "docs only";
  closeLine.subject.resultDigest = closeLine.subject.resultDigest.replace(/<[^<>]*>/, sha256("result.md"));
  closeLine.by = "owner";
  writeFileSync(join(dir, "decisions.jsonl"), `${readFileSync(join(dir, "decisions.jsonl"), "utf8")}${JSON.stringify(closeLine)}\n`);
  const closed = statusRow(root, WORK);
  assert.equal(closed.stage, "CLOSED");
  assert.match(closed.next, /: docs only · written into the project: 0$/);
});

test("images that are empty, mislabelled or symlinked are not screenshots", () => {
  const { root } = uiWork();
  const result = reviewWith(root, WORK, {
    ...SHOTS,
    verifier: rendering((dir) => {
      writeFileSync(join(dir, "empty.png"), "");
      writeFileSync(join(dir, "bad.jpg"), "not a jpeg");
      writeFileSync(join(dir, "target.bin"), Buffer.concat([PNG_BYTES.subarray(0, 8), Buffer.from("real")]));
      symlinkSync(join(dir, "target.bin"), join(dir, "link.png"));
      writeFileSync(join(dir, "header.png"), PNG_BYTES.subarray(0, 40));
      writeFileSync(join(dir, "photo.jpg"), PNG_BYTES);
    }),
  });
  assert.equal(result.state.terminal.status, "FAILED");
  const finished = verifyFinished(root, result.runId);
  assert.equal(finished.data.status, "failed");
  assert.match(finished.data.reason, /bad\.jpg \(only PNG screenshots are accepted\)/);
  assert.match(finished.data.reason, /photo\.jpg \(only PNG screenshots are accepted\)/);
  assert.match(finished.data.reason, /empty\.png \(not a decodable PNG\)/);
  assert.match(finished.data.reason, /header\.png \(not a decodable PNG\)/);
  assert.match(finished.data.reason, /link\.png \(not a regular file\)/);
  assert.equal(screenshots(result.state).length, 0);
});

test("approval refuses a screenshot whose file no longer matches its digest", () => {
  const { root, sha } = uiWork();
  // The requirement was frozen with the run: the approval reads it from
  // there, whatever a run config says by then.
  const result = reviewWith(root, WORK, { ...SHOTS, verifier: rendering() });
  assert.equal(result.state.run.status, "WAITING_HUMAN");
  rmSync(runFile(root, result.runId, "screenshots", "verify-1", "home.png"));
  const decisions = readFileSync(join(root, "delivery", "work", WORK, "decisions.jsonl"), "utf8");
  assert.throws(() => approve(root, sha), /approval refused by policy: merge-evidence-floor \(screenshot evidence no longer matches its file: /);
  assert.equal(readFileSync(join(root, "delivery", "work", WORK, "decisions.jsonl"), "utf8"), decisions);
  assert.equal(EventLedger.open(result.ledgerPath).state.terminal, null);
});

test("a screenshot lost before the decision is replaced by reviewing the same commit again", () => {
  const { root, sha } = uiWork();
  const first = reviewWith(root, WORK, { ...SHOTS, verifier: rendering() });
  rmSync(runFile(root, first.runId, "screenshots", "verify-1", "home.png"));
  // The reviewer of the second run is shown the new file.
  let shown = null;
  const second = reviewWith(root, WORK, {
    ...SHOTS,
    verifier: rendering(),
    reviewer: worker(({ input }) => {
      shown = input.screenshots;
      return { envelope: { findings: [] } };
    }),
  });
  assert.equal(second.runId, "RUN-S-02");
  assert.deepEqual(second.superseded, ["RUN-S-01"]);
  assert.equal(second.candidate, sha);
  const shots = screenshots(second.state);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].ref, ".buildbeat/runtime/runs/RUN-S-02/screenshots/verify-1/home.png");
  assert.equal(shown.length, 1);
  assert.match(shown[0].path, /RUN-S-02[/\\]screenshots[/\\]verify-1[/\\]home\.png$/);
  assert.equal(shown[0].digest, shots[0].digest);
  assert.equal(approve(root, sha).state.terminal.status, "SUCCEEDED");
});

test("release records the requested ref and the checkout it ran in, with unique logs", () => {
  const { root, base } = fixture({ prefix: "bb-shot-", work: WORK, projectConfig: PROJECT_CONFIG + yaml(RELEASE) });
  const dir = join(root, "delivery", "work", WORK);
  const { sha } = approved(root, WORK, CHANGE);
  git(root, ["branch", "before", base]);
  git(root, ["branch", "released", "HEAD"]);
  // The main checkout moves on after the release.
  commit(root, "later", { "later.txt": "later\n" });

  const before = call(root, release(["--ref", "before"]));
  assert.equal(before.status, 1);
  assert.match(before.err, new RegExp(`candidate ${sha.slice(0, 7)} \\(RUN-S-01\\) is not contained in before \\(${base.slice(0, 7)}\\); merge it first`));
  assert.equal(existsSync(join(dir, "releases.jsonl")), false);

  const out = ok(root, release(["--ref", "released"]));
  assert.match(out, /readback passed \(exit 0\) for released at/);
  assert.match(out, /the command ran in the main checkout at \w{7}, not at released/);
  const row = jsonl(root, WORK, "releases.jsonl").at(-1);
  assert.equal(row.ref, "released");
  assert.equal(row.commit, sha);
  assert.equal(row.checkout, git(root, ["rev-parse", "HEAD"]));
  assert.notEqual(row.checkout, row.commit);

  // A log already named the way a row-count allocator would name the next
  // one belongs to someone else and must survive.
  const logDir = join(root, ".buildbeat", "runtime", "releases", WORK);
  const foreign = join(logDir, `release-${jsonl(root, WORK, "releases.jsonl").length + 1}.log`);
  writeFileSync(foreign, "someone else's log\n");
  ok(root, release(["--ref", "released"]));
  assert.equal(readFileSync(foreign, "utf8"), "someone else's log\n");
  assert.notEqual(join(root, jsonl(root, WORK, "releases.jsonl").at(-1).log), foreign);

  // Two readbacks at the same instant still get their own logs.
  const at = "2026-10-04T00:00:00.000Z";
  const spec = { command: "bash", args: ["readback.sh"] };
  const first = runReadback({ repoRoot: root, workId: WORK, spec, runs: runsFor(root, WORK), ts: at });
  const second = runReadback({ repoRoot: root, workId: WORK, spec, runs: runsFor(root, WORK), ts: at });
  assert.notEqual(first.log, second.log);
});

test("concurrent readbacks keep separate logs whose digests match their records", async () => {
  const { root } = fixture({
    prefix: "bb-shot-",
    work: WORK,
    projectConfig: PROJECT_CONFIG + yaml(["release:", "  command: bash", "  args:", "    - -c", "    - sleep 1; echo health ok"]),
  });
  approved(root, WORK);
  // Both processes read the same (empty) releases.jsonl before either
  // appends: an allocator keyed on its row count would hand out one log.
  const launch = () =>
    new Promise((done, fail) => {
      const child = spawn(process.execPath, [CLI, ...release()], { cwd: root });
      child.on("error", fail);
      child.on("close", done);
    });
  assert.deepEqual(await Promise.all([launch(), launch()]), [0, 0]);
  const rows = jsonl(root, WORK, "releases.jsonl");
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].log, rows[1].log);
  for (const row of rows) {
    const body = readFileSync(join(root, row.log), "utf8");
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
  // One row of just a filter byte: only the width guard rejects it.
  assert.equal(png.valid(makePng(0, 1)), false, "zero width");
  assert.equal(png.valid(makePng(1, 0)), false, "zero height");
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

test("a screenshot recorded under looser rules does not carry a merge", () => {
  const { root, sha } = uiWork();
  const result = reviewWith(root, WORK, { ...SHOTS, verifier: rendering() });
  // A WebP file recorded by an earlier rule set, with a matching digest.
  const ledger = EventLedger.open(result.ledgerPath);
  const verify = ledger.state.evidence.find((item) => item.kind === "command" && item.ref.endsWith("verify-1.log"));
  const webpRef = ".buildbeat/runtime/runs/RUN-S-01/screenshots/verify-1/old.webp";
  writeFileSync(join(root, webpRef), "RIFF-not-checked");
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
    },
  });
  assert.throws(() => approve(root, sha), /no longer matches its file: .*old\.webp/);
  assert.equal(EventLedger.open(result.ledgerPath).state.terminal, null);
});

test("rejected files are reported even when another screenshot passes", () => {
  const { root } = uiWork();
  const result = reviewWith(root, WORK, {
    ...SHOTS,
    verifier: rendering((dir) => {
      writeFileSync(join(dir, "home.png"), PNG_BYTES);
      writeFileSync(join(dir, "photo.jpg"), PNG_BYTES);
    }),
  });
  assert.equal(result.state.run.status, "WAITING_HUMAN");
  const finished = verifyFinished(root, result.runId);
  assert.equal(finished.data.status, "succeeded");
  assert.deepEqual(finished.data.screenshotsRejected, ["photo.jpg (only PNG screenshots are accepted)"]);
  assert.match(
    readFileSync(runFile(root, result.runId, "logs", "verify-1.log"), "utf8"),
    /screenshots rejected: photo\.jpg \(only PNG screenshots are accepted\)/,
  );
  assert.equal(screenshots(result.state).length, 1);
});
