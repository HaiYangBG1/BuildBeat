// Owner decisions before 4.0 (2026-10-04): UI work can require screenshots
// of the real render before the merge decision, and a merged Work closes
// only after the project's own readback of the release has passed.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { checkRunConfigShape } from "../src/v2/cli/run-config-check.js";
import { payloadFor } from "../src/v2/adapters/notification-payload.js";
import { deliveryChecks, evaluatePolicies } from "../src/v2/policy/policy.js";
import { buildNotification } from "../src/v2/runtime/notify.js";
import { runsFor } from "../src/v2/runtime/overview.js";
import { runReadback } from "../src/v2/runtime/release.js";
import { tempDir } from "./support/tmp.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");

function fixture({ verify, review = "", extra = "" }) {
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
      ...["builder", "verifier", "reviewer", "fixer"].flatMap((name, i) => [
        `  ${name}:`,
        "    command: bash",
        "    args:",
        "      - worker.sh",
        `      - ${["build", "verify", "review", "fix"][i]}`,
      ]),
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
const RENDER = `printf '\\211PNG\\r\\n\\032\\nIHDR-bytes' > "$BUILDBEAT_SCREENSHOT_DIR/home.png"`;
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("IHDR-bytes"),
]);

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
  assert.match(finished.data.reason, /requireScreenshot is on, but verify left no image/);
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
  const other = { kind: "screenshot", status: "passed", grade: "L2", subject: "c1", ref: "a.png" };
  assert.notEqual(judge([command, review, other]).result, "PASS");
  assert.equal(judge([command, review, { ...other, subject: "c2" }]).result, "PASS");
  assert.throws(() => deliveryChecks({ requireScreenshot: "yes" }), /invalid delivery safeguards/);
});

test("decision notifications carry screenshot references, never the images", () => {
  const state = {
    run: { id: "RUN-N", work: "WORK-N", status: "WAITING_HUMAN", deliveryChecks: { artifact: "work" } },
    pendingHuman: { transition: "enter-wait-merge", kind: "final-decision", reasons: [], subject: { candidate: "abc1234" } },
    evidence: [
      { kind: "screenshot", status: "passed", subject: "abc1234", ref: ".buildbeat/runtime/runs/RUN-N/screenshots/verify-1/home.png", digest: "sha256:aa" },
      { kind: "screenshot", status: "passed", subject: "old0000", ref: "old.png", digest: "sha256:bb" },
    ],
    workspaces: {},
  };
  const notification = buildNotification("HUMAN_REQUESTED", { repoLabel: ".", state });
  assert.deepEqual(notification.screenshots, [
    { ref: ".buildbeat/runtime/runs/RUN-N/screenshots/verify-1/home.png", digest: "sha256:aa" },
  ]);
  const text = payloadFor({ type: "dingtalk", keyword: "BuildBeat" }, notification).text.content;
  assert.match(text, /screenshot: \.buildbeat\/runtime\/runs\/RUN-N\/screenshots\/verify-1\/home\.png sha256:aa/);
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
  example.decisionRef = "A-WORK-S-1";
  example.by = "owner";
  example.subject.digest = `sha256:${createHash("sha256").update(readFileSync(join(f.dir, "work.md"))).digest("hex")}`;
  writeFileSync(join(f.dir, "decisions.jsonl"), `${JSON.stringify(example)}\n`);
  const ready = JSON.parse(f.ok("status", "--repo", ".", "--work", "WORK-S", "--json")).works[0];
  assert.equal(ready.stage, "READY_TO_RUN");
  f.ok("run", "--config", f.config);
  assert.equal(f.state("RUN-S-01").pendingHuman.transition, "enter-wait-merge");
  f.ok("decide", "--repo", ".", "--run", "RUN-S-01", "--action", "reject", "--reason", "documentation only");
  // A Work that needs no release closes with a hand-written close-work line.
  writeFileSync(
    join(f.dir, "decisions.jsonl"),
    `${readFileSync(join(f.dir, "decisions.jsonl"), "utf8")}${JSON.stringify({ transition: "close-work", decision: "closed", subject: { result: "docs only" }, by: "owner", ts: "2026-10-04T09:00:00.000Z" })}\n`,
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
  assert.match(finished.data.reason, /bad\.jpg \(not a jpeg image\)/);
  assert.match(finished.data.reason, /empty\.png \(not a png image\)/);
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

  // Two readbacks at the same instant still get their own logs.
  const at = "2026-10-04T00:00:00.000Z";
  const spec = { command: "bash", args: ["readback.sh"] };
  const first = runReadback({ repoRoot: f.root, workId: "WORK-S", spec, runs: runsFor(f.root, "WORK-S"), ts: at });
  const second = runReadback({ repoRoot: f.root, workId: "WORK-S", spec, runs: runsFor(f.root, "WORK-S"), ts: at });
  assert.notEqual(first.log, second.log);
  for (const recorded of [first, second]) {
    const body = readFileSync(join(f.root, recorded.log), "utf8");
    assert.equal(recorded.digest, `sha256:${createHash("sha256").update(body, "utf8").digest("hex")}`);
  }
});
