// `buildbeat review` (WORK-CLEAN-START): one existing commit is verified and
// reviewed, and the decision on it is recorded by work. Everything here goes
// through the CLI, the way a session uses it.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { tempDir } from "./support/tmp.js";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "bin", "buildbeat.js");
const WORK = "WORK-A";
const P1 = { severity: "P1", summary: "the feature text is wrong" };

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function cli(args) {
  const result = spawnSync("node", [CLI, ...args], { encoding: "utf8" });
  return { status: result.status, out: result.stdout, err: result.stderr, all: `${result.stdout}${result.stderr}` };
}

const yaml = (lines) => `${lines.join("\n")}\n`;

// The verifier wants src/feature.txt; the reviewer reports whatever
// findings.json the commit carries, and nothing when there is none.
const PROJECT_CONFIG = yaml([
  "workers:",
  "  verifier:",
  "    command: bash",
  "    args:",
  "      - -lc",
  "      - test -f src/feature.txt",
  "  reviewer:",
  "    command: sh",
  "    args:",
  "      - tools/reviewer.sh",
]);

const REVIEWER = [
  "#!/bin/sh",
  'if [ -f findings.json ]; then cat findings.json > "$BUILDBEAT_OUTPUT"; else printf \'{"findings":[]}\' > "$BUILDBEAT_OUTPUT"; fi',
  "",
].join("\n");

function write(root, path, text) {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), text);
}

function commit(root, message, files = {}) {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) git(root, ["rm", "-q", path]);
    else write(root, path, text);
  }
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

// A repository with the project config and the reviewer, then a commit that
// holds the work's description: the work starts there (`base`).
function fixture({ projectConfig = PROJECT_CONFIG, workConfig = null, accept = true } = {}) {
  const root = tempDir("bb-v2-review-");
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  commit(root, "baseline", {
    ".gitignore": ".buildbeat/\n",
    "tools/reviewer.sh": REVIEWER,
    ...(projectConfig === null ? {} : { "delivery/run-config.yaml": projectConfig }),
  });
  const base = commit(root, "describe the work", {
    ...(workConfig === null ? {} : { [`delivery/work/${WORK}/run-config.yaml`]: workConfig }),
    [`delivery/work/${WORK}/work.md`]: "# Add the feature\n\n## Goal\nA feature file.\n",
  });
  if (accept) {
    const accepted = cli(["accept", "--repo", root, "--work", WORK, "--by", "owner", "--as", "human"]);
    assert.equal(accepted.status, 0, accepted.all);
  }
  return { root, base };
}

const review = (root, extra = []) => cli(["review", "--repo", root, "--work", WORK, ...extra]);
const decide = (root, args) => cli(["decide", "--repo", root, "--work", WORK, "--by", "owner", "--as", "human", ...args]);
const record = (root, run) =>
  JSON.parse(readFileSync(join(root, "delivery", "work", WORK, "runs", run, "run-record.json"), "utf8"));
const jsonl = (root, name) =>
  readFileSync(join(root, "delivery", "work", WORK, name), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const stage = (root) =>
  JSON.parse(cli(["status", "--repo", root, "--json"]).out).works.find((row) => row.work === WORK);

test("a commit is verified, reviewed and left for the person; approval binds to that commit", () => {
  const { root, base } = fixture();
  const sha = commit(root, "add the feature", { "src/feature.txt": "hello\n" });

  const reviewed = review(root);
  assert.equal(reviewed.status, 0, reviewed.all);
  assert.match(reviewed.out, new RegExp(`reviewing ${sha.slice(0, 7)} as RUN-A-01 \\(changes since ${base.slice(0, 7)}\\)`));
  assert.match(reviewed.out, /status: WAITING_HUMAN/);
  assert.match(reviewed.out, /step verify: SUCCEEDED \(attempts 1\)/);
  assert.match(reviewed.out, /step review: SUCCEEDED \(attempts 1\)/);
  assert.match(reviewed.out, new RegExp(`decide --repo \\S+ --work ${WORK} --action approve --candidate ${sha} --by <you>`));
  // The checkout and its branch do not outlive the review.
  assert.equal(existsSync(join(root, ".buildbeat", "worktrees", "RUN-A-01")), false);
  assert.equal(git(root, ["branch", "--list", "run/*"]), "");
  assert.equal(stage(root).stage, "MERGE_DECISION");

  const approved = decide(root, ["--action", "approve", "--candidate", sha]);
  assert.equal(approved.status, 0, approved.all);
  assert.match(approved.out, /approved enter-wait-merge as D-RUN-A-01-1 by owner/);
  assert.match(approved.out, /RUN-A-01 is terminal: SUCCEEDED/);

  // The records keep the shape every run has had.
  const run = record(root, "RUN-A-01");
  assert.deepEqual(Object.keys(run), [
    "run", "work", "workflow", "pass", "deliveryChecks", "terminal", "events", "startedAt", "finishedAt",
    "attempts", "budgets", "cost", "workspaces", "evidence", "decisions", "approvals", "unverified",
  ]);
  assert.equal(run.pass, true);
  assert.equal(run.terminal.status, "SUCCEEDED");
  assert.deepEqual(run.attempts, { verify: 1, review: 1 });
  assert.equal(run.workspaces["RUN-A-01"].base, base);
  assert.equal(run.workspaces["RUN-A-01"].candidate, sha);
  assert.deepEqual(run.deliveryChecks, { artifact: "work", requireAcceptance: true, requireIntent: false, maxSeverity: "P2" });
  const decision = jsonl(root, "decisions.jsonl").at(-1);
  assert.equal(decision.run, "RUN-A-01");
  assert.equal(decision.transition, "enter-wait-merge");
  assert.equal(decision.decision, "approved");
  assert.equal(decision.subject.candidate, sha);
  assert.equal(stage(root).stage, "MERGED");

  // Nothing waits any more.
  const again = decide(root, ["--action", "approve", "--candidate", sha]);
  assert.equal(again.status, 1);
  assert.match(again.err, /no reviewed commit of WORK-A waits for a decision/);
});

test("a blocking finding does not end the run: approval is refused until it is dismissed", () => {
  const { root } = fixture();
  const sha = commit(root, "add the feature", {
    "src/feature.txt": "helo\n",
    "findings.json": JSON.stringify({ findings: [P1] }),
  });

  const reviewed = review(root);
  assert.equal(reviewed.status, 0, reviewed.all);
  assert.match(reviewed.out, /status: WAITING_HUMAN/);
  assert.match(reviewed.out, /review found 1 blocking finding\(s\); approval is refused until each is dismissed, or a fixed commit is reviewed/);
  // What to do about the finding comes before the approval it blocks.
  const hints = reviewed.out.slice(reviewed.out.indexOf("next (copy one):"));
  assert.ok(hints.indexOf("buildbeat review --repo") < hints.indexOf("--action approve"), hints);
  assert.match(hints, /--action approve --candidate \S+ --by <you> {3}# refused while a blocking finding stands/);

  const refused = decide(root, ["--action", "approve", "--candidate", sha]);
  assert.equal(refused.status, 1);
  assert.match(refused.err, /approval refused by policy: merge-evidence-floor \(1 finding\(s\) more severe than P2\)/);

  const fingerprint = jsonl(root, "review-findings.jsonl").find((row) => row.kind === "finding").fingerprint;
  const dismissed = decide(root, ["--action", "dismiss", "--fingerprint", fingerprint, "--note", "wording is intended"]);
  assert.equal(dismissed.status, 0, dismissed.all);

  // The same commit, without another review.
  const approved = decide(root, ["--action", "approve", "--candidate", sha]);
  assert.equal(approved.status, 0, approved.all);
  assert.equal(record(root, "RUN-A-01").terminal.status, "SUCCEEDED");
});

test("a fixed commit is a new run that supersedes the waiting one; the old commit cannot be approved", () => {
  const { root } = fixture();
  const first = commit(root, "add the feature", {
    "src/feature.txt": "helo\n",
    "findings.json": JSON.stringify({ findings: [P1] }),
  });
  assert.equal(review(root).status, 0);
  const second = commit(root, "fix the text", { "src/feature.txt": "hello\n", "findings.json": null });

  const reviewed = review(root);
  assert.equal(reviewed.status, 0, reviewed.all);
  assert.match(reviewed.out, /reviewing \w{7} as RUN-A-02/);
  assert.match(reviewed.out, /superseded RUN-A-01 /);
  assert.match(reviewed.out, /verified and reviewed with no blocking finding/);
  assert.equal(record(root, "RUN-A-01").terminal.status, "SUPERSEDED");
  assert.equal(record(root, "RUN-A-01").workspaces["RUN-A-01"].candidate, first);

  const stale = decide(root, ["--action", "approve", "--candidate", first]);
  assert.equal(stale.status, 1);
  assert.match(stale.err, new RegExp(`approval stale: the commit waiting for a decision is ${second}, not ${first}`));

  const approved = decide(root, ["--action", "approve", "--candidate", second]);
  assert.equal(approved.status, 0, approved.all);
  assert.match(approved.out, /RUN-A-02 is terminal: SUCCEEDED/);
});

test("an approval names the full commit; a rejection says why and ends the run", () => {
  const { root } = fixture();
  const sha = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  assert.equal(review(root).status, 0);

  const short = decide(root, ["--action", "approve", "--candidate", sha.slice(0, 7)]);
  assert.equal(short.status, 1);
  assert.match(short.err, new RegExp(`an approval names the full commit it approves: --candidate ${sha}`));
  const unnamed = decide(root, ["--action", "approve"]);
  assert.equal(unnamed.status, 1);
  assert.match(unnamed.err, /an approval names the full commit it approves/);

  const silent = decide(root, ["--action", "reject"]);
  assert.equal(silent.status, 1);
  assert.match(silent.err, /reject requires --reason <text>/);
  const rejected = decide(root, ["--action", "reject", "--reason", "not this way"]);
  assert.equal(rejected.status, 0, rejected.all);
  assert.match(rejected.out, new RegExp(`rejected ${sha.slice(0, 7)} as D-RUN-A-01-1 by owner .*; RUN-A-01 cancelled and compacted`));
  const run = record(root, "RUN-A-01");
  assert.equal(run.terminal.status, "CANCELLED");
  assert.match(run.terminal.reason, /rejected by owner: not this way/);
  assert.equal(jsonl(root, "decisions.jsonl").at(-1).reason, "not this way");
});

test("a failed verify ends the run FAILED: nothing waits, nothing was reviewed", () => {
  const { root } = fixture();
  const sha = commit(root, "add something else", { "src/other.txt": "hello\n" });

  const reviewed = review(root);
  assert.equal(reviewed.status, 1);
  assert.match(reviewed.out, /terminal: FAILED \(verify failed \(exit 1\)\)/);
  assert.match(reviewed.out, /next: fix it, commit, then buildbeat review --repo \S+ --work WORK-A/);
  assert.doesNotMatch(reviewed.out, /step review/);
  const run = record(root, "RUN-A-01");
  assert.equal(run.terminal.status, "FAILED");
  assert.deepEqual(run.attempts, { verify: 1 });
  assert.equal(run.workspaces["RUN-A-01"].candidate, sha);
  assert.equal(existsSync(join(root, ".buildbeat", "worktrees", "RUN-A-01")), false);

  const approve = decide(root, ["--action", "approve", "--candidate", sha]);
  assert.equal(approve.status, 1);
  assert.match(approve.err, /no reviewed commit of WORK-A waits for a decision/);
  // The commit is on the branch, but nobody approved it.
  const row = stage(root);
  assert.equal(row.stage, "STOPPED_FAILED");
  assert.equal(row.merged, false);
  assert.match(row.next, /commit a fix and buildbeat review --repo \S+ --work WORK-A/);
});

test("a tooling failure ends the run CANCELLED, which is no verdict on the commit", async (t) => {
  const cases = {
    "the verifier reports its environment unavailable (exit 75)": {
      config: ["workers:", "  verifier:", "    command: bash", "    args:", "      - -lc", "      - exit 75"],
      reason: /worker infrastructure failure at verify: exit 75/,
    },
    "the reviewer writes into the checkout": {
      config: ["workers:", "  reviewer:", "    command: sh", "    args:", "      - -c", "      - echo scribble > note.txt"],
      reason: /read-only step review modified the workspace/,
    },
    "the reviewer leaves no report": {
      config: ["workers:", "  reviewer:", "    command: sh", "    args:", "      - -c", "      - echo looks fine"],
      reason: /worker infrastructure failure at review: the reviewer exited 0 without writing a report/,
    },
    "the reviewer exits non-zero": {
      config: ["workers:", "  reviewer:", "    command: sh", "    args:", "      - -c", "      - exit 3"],
      reason: /review exited 3 without a verdict; not a candidate defect/,
    },
  };
  for (const [name, { config, reason }] of Object.entries(cases)) {
    await t.test(name, () => {
      const { root } = fixture({ workConfig: yaml(config) });
      commit(root, "add the feature", { "src/feature.txt": "hello\n" });
      const reviewed = review(root);
      assert.equal(reviewed.status, 1, reviewed.all);
      assert.match(reviewed.out, /terminal: CANCELLED/);
      assert.match(reviewed.out, /next: once the tooling works again, buildbeat review/);
      const run = record(root, "RUN-A-01");
      assert.equal(run.terminal.status, "CANCELLED");
      assert.match(run.terminal.reason, reason);
      assert.equal(existsSync(join(root, ".buildbeat", "worktrees", "RUN-A-01")), false);
      assert.equal(git(root, ["status", "--porcelain", "--", "note.txt"]), "");
    });
  }
});

test("a verifier that moves the checkout off the commit under review fails the run", () => {
  // Commits in the checkout: HEAD is no longer the commit that was sent.
  const { root } = fixture({
    workConfig: yaml([
      "workers:", "  verifier:", "    command: bash", "    args:", "      - -c",
      "      - 'echo extra > src/extra.txt && git add src/extra.txt && git commit -q -m sneaked-in'",
    ]),
  });
  const sha = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const reviewed = review(root);
  assert.equal(reviewed.status, 1, reviewed.all);
  assert.match(reviewed.out, new RegExp(`terminal: FAILED \\(step verify moved the checkout from ${sha.slice(0, 7)} to \\w{7}; a review judges the commit it was given\\)`));
  // Nothing was reviewed, the candidate is still the commit that was sent,
  // and the commit the verifier made went away with the checkout.
  assert.doesNotMatch(reviewed.out, /step review/);
  const run = record(root, "RUN-A-01");
  assert.equal(run.terminal.status, "FAILED");
  assert.equal(run.workspaces["RUN-A-01"].candidate, sha);
  assert.equal(git(root, ["rev-parse", "HEAD"]), sha);
  assert.equal(git(root, ["branch", "--list", "run/*"]), "");
  const approve = decide(root, ["--action", "approve", "--candidate", sha]);
  assert.equal(approve.status, 1);
  assert.match(approve.err, /no reviewed commit of WORK-A waits for a decision/);
});

test("a review whose process died is ended by the next review of the work", () => {
  // The verifier kills the CLI that runs it while the commit carries kill-me.
  const { root } = fixture({
    workConfig: yaml([
      "workers:", "  verifier:", "    command: bash", "    args:", "      - -c",
      "      - 'if [ -f kill-me ]; then kill -9 $PPID; sleep 5; fi; test -f src/feature.txt'",
    ]),
  });
  const first = commit(root, "add the feature", { "src/feature.txt": "hello\n", "kill-me": "x\n" });
  const killed = review(root);
  assert.notEqual(killed.status, 0);
  // Left as it fell: recorded as running, with its checkout.
  assert.equal(stage(root).stage, "RUNNING");
  assert.equal(existsSync(join(root, ".buildbeat", "worktrees", "RUN-A-01")), true);

  commit(root, "drop the trap", { "kill-me": null });
  const reviewed = review(root);
  assert.equal(reviewed.status, 0, reviewed.all);
  assert.match(reviewed.out, /ended RUN-A-01 \(its review was interrupted: the process is gone; now CANCELLED\)/);
  assert.match(reviewed.out, /reviewing \w{7} as RUN-A-02/);
  assert.match(reviewed.out, /status: WAITING_HUMAN/);
  const run = record(root, "RUN-A-01");
  assert.equal(run.terminal.status, "CANCELLED");
  assert.match(run.terminal.reason, /interrupted: the process that ran this review is gone; superseded by RUN-A-02/);
  assert.equal(run.workspaces["RUN-A-01"].candidate, first);
  assert.equal(existsSync(join(root, ".buildbeat", "worktrees", "RUN-A-01")), false);
  assert.equal(git(root, ["branch", "--list", "run/*"]), "");
  assert.equal(stage(root).stage, "MERGE_DECISION");
});

test("a commit that changes paths outside the work's allowedPaths fails; the work's own records are always in scope", () => {
  const { root } = fixture({ workConfig: yaml(["allowedPaths:", "  - src"]) });
  // The commit also carries the acceptance row in the work's decisions.jsonl.
  commit(root, "add the feature and more", { "src/feature.txt": "hello\n", "docs/extra.md": "extra\n" });
  assert.match(git(root, ["show", "--name-only", "--format=", "HEAD"]), /delivery\/work\/WORK-A\/decisions\.jsonl/);
  const reviewed = review(root);
  assert.equal(reviewed.status, 1);
  assert.match(reviewed.out, /terminal: FAILED \(the commit changes paths outside the allowed scope: docs\/extra\.md\)/);

  commit(root, "drop the extra", { "docs/extra.md": null });
  const again = review(root);
  assert.equal(again.status, 0, again.all);
  assert.match(again.out, /status: WAITING_HUMAN/);
});

test("review refuses, before recording anything, what it could not stand behind", async (t) => {
  const nothingRecorded = (root) => {
    assert.equal(existsSync(join(root, ".buildbeat", "worktrees")) && git(root, ["worktree", "list"]).split("\n").length > 1, false);
    assert.equal(existsSync(join(root, "delivery", "work", WORK, "runs")), false);
    assert.equal(git(root, ["branch", "--list", "run/*"]), "");
  };
  await t.test("a work.md nobody accepted", () => {
    const { root } = fixture({ accept: false });
    commit(root, "add the feature", { "src/feature.txt": "hello\n" });
    const refused = review(root);
    assert.equal(refused.status, 1);
    assert.match(refused.err, /delivery\/work\/WORK-A\/work\.md is not accepted \(artifact work has never been accepted\); buildbeat accept --repo \S+ --work WORK-A --by <you>/);
    nothingRecorded(root);
  });
  await t.test("a work.md edited after its acceptance", () => {
    const { root } = fixture();
    commit(root, "widen the scope and add the feature", {
      "src/feature.txt": "hello\n",
      [`delivery/work/${WORK}/work.md`]: "# Add two features\n",
    });
    const refused = review(root);
    assert.equal(refused.status, 1);
    assert.match(refused.err, /is not accepted \(artifact work changed after its acceptance \(stale acceptance\)\)/);
    nothingRecorded(root);
  });
  await t.test("a commit that carries another work.md than the accepted one", () => {
    const { root } = fixture();
    const accepted = readFileSync(join(root, "delivery", "work", WORK, "work.md"), "utf8");
    commit(root, "widen the scope", { [`delivery/work/${WORK}/work.md`]: "# Add two features\n" });
    commit(root, "add the feature", { "src/feature.txt": "hello\n" });
    // The main checkout holds the accepted bytes again; the commit does not.
    write(root, `delivery/work/${WORK}/work.md`, accepted);
    const refused = review(root, ["--commit", "HEAD"]);
    assert.equal(refused.status, 1);
    assert.match(refused.err, /commit \w{7} carries a different delivery\/work\/WORK-A\/work\.md than the accepted one/);
    nothingRecorded(root);
  });
  await t.test("the commit the work starts from", () => {
    const { root, base } = fixture();
    const refused = review(root);
    assert.equal(refused.status, 1);
    assert.match(refused.err, new RegExp(`nothing to review: ${base.slice(0, 7)} is the commit the work starts from; commit the change after it, or name an earlier start as base: in delivery/work/WORK-A/run-config.yaml`));
    nothingRecorded(root);
  });
  await t.test("a repository without a project config", () => {
    const { root } = fixture({ projectConfig: null });
    commit(root, "add the feature", { "src/feature.txt": "hello\n" });
    const refused = review(root);
    assert.equal(refused.status, 1);
    assert.match(refused.err, /no delivery\/run-config\.yaml in this repository: write one that names workers\.verifier and workers\.reviewer/);
    nothingRecorded(root);
  });
  await t.test("a name that is not a commit", () => {
    const { root } = fixture();
    const refused = review(root, ["--commit", "no-such-ref"]);
    assert.equal(refused.status, 1);
    assert.match(refused.err, /no-such-ref does not name a commit/);
    nothingRecorded(root);
  });
});

test("the project config has only what a review needs; a work overrides what it names", async (t) => {
  await t.test("keys that drove an agent are unknown", () => {
    const { root } = fixture({
      projectConfig: yaml([
        "budgets:", "  reviewRoundsPerWork: 6", "reviewTriage: off",
        "workers:", "  builder:", "    command: codex",
        "  verifier:", "    command: bash", "  reviewer:", "    command: sh",
      ]),
    });
    commit(root, "add the feature", { "src/feature.txt": "hello\n" });
    const refused = review(root);
    assert.equal(refused.status, 1);
    assert.match(refused.err, /run config delivery\/run-config\.yaml has 3 problem\(s\)/);
    assert.match(refused.err, /- budgets: unknown key/);
    assert.match(refused.err, /- reviewTriage: unknown key/);
    assert.match(refused.err, /- workers\.builder: unknown key/);
  });
  await t.test("a work's file is named when it is the one at fault", () => {
    const { root } = fixture({ workConfig: yaml(["repo: ../../..", "run: RUN-A", "allowedPaths: src"]) });
    commit(root, "add the feature", { "src/feature.txt": "hello\n" });
    const refused = review(root);
    assert.equal(refused.status, 1);
    assert.match(refused.err, /run config delivery\/work\/WORK-A\/run-config\.yaml has 3 problem\(s\)/);
    assert.match(refused.err, /- repo: unknown key/);
    assert.match(refused.err, /- run: unknown key/);
    assert.match(refused.err, /- allowedPaths: must be a list/);
  });
  await t.test("a verifier and a reviewer are both required", () => {
    const { root } = fixture({ projectConfig: yaml(["workers:", "  verifier:", "    command: bash"]) });
    commit(root, "add the feature", { "src/feature.txt": "hello\n" });
    const refused = review(root);
    assert.equal(refused.status, 1);
    assert.match(refused.err, /- workers\.reviewer: required and missing/);
  });
  await t.test("a work swaps its verifier and keeps the project's reviewer", () => {
    const { root } = fixture({
      workConfig: yaml(["workers:", "  verifier:", "    command: bash", "    args:", "      - -lc", "      - test -f src/other.txt"]),
    });
    commit(root, "add the other file", { "src/other.txt": "hello\n", "findings.json": JSON.stringify({ findings: [P1] }) });
    const reviewed = review(root);
    assert.equal(reviewed.status, 0, reviewed.all);
    assert.match(reviewed.out, /step verify: SUCCEEDED/);
    assert.match(reviewed.out, /review found 1 blocking finding/);
  });
  await t.test("base: in the work's file names where the work starts", () => {
    const { root, base } = fixture();
    const first = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
    commit(root, "polish", { "src/feature.txt": "hello!\n" });
    write(root, `delivery/work/${WORK}/run-config.yaml`, yaml([`base: ${first}`]));
    const reviewed = review(root);
    assert.equal(reviewed.status, 0, reviewed.all);
    assert.match(reviewed.out, new RegExp(`\\(changes since ${first.slice(0, 7)}\\)`));
    assert.notEqual(first, base);
  });
});

test("the reviewer is told where the change starts and which commit it saw last", () => {
  const { root, base } = fixture({
    workConfig: yaml([
      "workers:", "  reviewer:", "    command: node", "    args:", "      - tools/echo-input.mjs",
    ]),
  });
  // Reports its own input as a P3 finding, which blocks nothing.
  commit(root, "add a reviewer that reports its input", {
    "tools/echo-input.mjs": [
      'import { writeFileSync } from "node:fs";',
      "const input = JSON.parse(process.env.BUILDBEAT_INPUT);",
      'const summary = `base=${input.base} last=${input.lastReviewed?.candidate ?? "none"} work=${input.workArtifact.ref}`;',
      'writeFileSync(process.env.BUILDBEAT_OUTPUT, JSON.stringify({ findings: [{ severity: "P3", summary }] }));',
      "",
    ].join("\n"),
  });
  const first = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  assert.equal(review(root).status, 0);
  commit(root, "polish", { "src/feature.txt": "hello!\n" });
  assert.equal(review(root).status, 0);
  const summaries = jsonl(root, "review-findings.jsonl").filter((row) => row.kind === "finding").map((row) => row.summary);
  assert.deepEqual(summaries, [
    `base=${base} last=none work=delivery/work/${WORK}/work.md`,
    `base=${base} last=${first} work=delivery/work/${WORK}/work.md`,
  ]);
});

test("the per-run commands point a reviewed commit at the commands that decide it", () => {
  const { root } = fixture();
  const sha = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  assert.equal(review(root).status, 0);

  const approve = cli(["decide", "--repo", root, "--run", "RUN-A-01", "--action", "approve", "--transition", "enter-wait-merge", "--candidate", sha, "--by", "owner"]);
  assert.equal(approve.status, 1);
  assert.match(approve.err, new RegExp(`RUN-A-01 reviewed one commit: approve it with buildbeat decide --repo <path> --work WORK-A --action approve --candidate ${sha}`));
  const fix = cli(["decide", "--repo", root, "--run", "RUN-A-01", "--action", "fix", "--reason", "tidy", "--by", "owner"]);
  assert.equal(fix.status, 1);
  assert.match(fix.err, /RUN-A-01 reviewed one commit and takes no repair; commit the fix and run buildbeat review/);
  // Still waiting, untouched.
  assert.equal(stage(root).stage, "MERGE_DECISION");
});

test("status sends a work of a reviewed repository to buildbeat review", () => {
  const { root } = fixture();
  const ready = stage(root);
  assert.equal(ready.stage, "READY_TO_RUN");
  assert.match(ready.next, /^commit the change, then buildbeat review --repo \S+ --work WORK-A$/);

  commit(root, "add the feature\n\nWork: WORK-A", { "src/feature.txt": "hello\n" });
  const committed = stage(root);
  assert.equal(committed.stage, "COMMITTED");
  assert.match(committed.next, /^buildbeat review --repo \S+ --work WORK-A; or, if it is done, close it out: /);
});

// The released 5.5.0 runtime, taken from its tag: what a session that has
// not upgraded yet reads these records with. A shallow clone has no tag, and
// the test says so instead of passing.
function released() {
  try {
    git(ROOT, ["rev-parse", "--verify", "--quiet", "v5.5.0^{commit}"]);
  } catch {
    return null;
  }
  const dir = tempDir("bb-v2-released-");
  const archive = execFileSync("git", ["-C", ROOT, "archive", "v5.5.0", "bin", "src", "package.json"], { maxBuffer: 1 << 28 });
  execFileSync("tar", ["-x", "-C", dir], { input: archive });
  assert.equal(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version, "5.5.0");
  return (args) => execFileSync("node", [join(dir, "bin", "buildbeat.js"), ...args], { encoding: "utf8" });
}

test("the released 5.5.0 reads what a review records: status, decisions and history", (t) => {
  const old = released();
  if (!old) {
    t.skip("tag v5.5.0 is not in this clone (a shallow checkout); run with full history");
    return;
  }
  const { root, base } = fixture();
  const first = commit(root, "add the feature\n\nWork: WORK-A", {
    "src/feature.txt": "helo\n",
    "findings.json": JSON.stringify({ findings: [P1] }),
  });
  assert.equal(review(root).status, 0);
  const row = (args = []) => JSON.parse(old(["status", "--repo", root, "--json", ...args])).works.find((item) => item.work === WORK);

  // A review still waiting, read from its ledger.
  const waiting = row();
  assert.equal(waiting.stage, "MERGE_DECISION");
  assert.equal(waiting.latest.id, "RUN-A-01");
  assert.equal(waiting.latest.candidate, first);
  assert.equal(waiting.openFindings, 1);

  // Superseded, then approved: run records and decision rows in Git.
  const second = commit(root, "fix the text\n\nWork: WORK-A", { "src/feature.txt": "hello\n", "findings.json": null });
  assert.equal(review(root).status, 0);
  assert.equal(decide(root, ["--action", "approve", "--candidate", second]).status, 0);
  // Only the records in Git from here on, as on another machine.
  execFileSync("rm", ["-rf", join(root, ".buildbeat")]);

  const approved = row(["--work", WORK]);
  assert.equal(approved.stage, "MERGED");
  assert.equal(approved.runs, 2);
  assert.equal(approved.latest.id, "RUN-A-02");
  assert.equal(approved.latest.status, "SUCCEEDED");
  assert.equal(approved.latest.candidate, second);
  assert.equal(approved.mergedCandidate, second);
  assert.equal(approved.cost.reviewRounds, 2);
  const merge = approved.decisions.find((item) => item.transition === "enter-wait-merge");
  assert.equal(merge.run, "RUN-A-02");
  assert.equal(merge.decision, "approved");
  assert.match(merge.who, /^owner \(person/);
  const text = old(["status", "--repo", root, "--work", WORK]);
  assert.match(text, /RUN-A-02 SUCCEEDED candidate \w{7} \(merged\)/);
  assert.match(text, /D-RUN-A-02-1 enter-wait-merge approved by owner/);

  // A line of the change traces back to the work through both runs' ranges.
  const trace = JSON.parse(old(["history", "--repo", root, "--path", "src/feature.txt", "--json"]));
  assert.equal(trace.untraced.lines, 0);
  assert.equal(trace.works.length, 1);
  assert.equal(trace.works[0].work, WORK);
  assert.equal(trace.works[0].lines, 1);
  assert.equal(trace.works[0].approved.run, "RUN-A-02");
  assert.equal(trace.works[0].approved.decisionRef, "D-RUN-A-02-1");
  const runs = JSON.parse(readFileSync(join(root, "delivery", "work", WORK, "runs", "RUN-A-02", "run-record.json"), "utf8"));
  assert.equal(runs.workspaces["RUN-A-02"].base, base);
});
