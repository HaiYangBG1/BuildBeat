// The surface a session uses, at its edges: what is compared when a review
// starts (the commit's work.md as that commit checks out), what an approval
// is held to (the checks frozen when the commit was reviewed), and what
// status shows for a work before and after its reviews.

import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { DecisionError, approveReview, rejectReview } from "../src/v2/runtime/decisions.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import {
  PROJECT_CONFIG,
  addWork,
  cli,
  commit,
  fixture,
  git,
  jsonl,
  review,
  reviewWith,
  statusRow,
  write,
  yaml,
} from "./support/review.js";

const WORK = "WORK-A";
const WORK_REF = `delivery/work/${WORK}/work.md`;
const ledgerPath = (root, run) => join(root, ".buildbeat", "runtime", "runs", run, "events.jsonl");
const accept = (root) => cli(["accept", "--repo", root, "--work", WORK, "--by", "owner", "--as", "human"]);

test("a work.md nobody accepted yet shows as a draft, and looking writes nothing", () => {
  const { root } = fixture({ prefix: "bb-simple-", accept: false });
  const row = statusRow(root, WORK, ["--work", WORK]);
  assert.equal(row.stage, "WORK_DRAFT");
  assert.equal(row.workArtifact, "work");
  assert.match(cli(["status", "--repo", root]).out, new RegExp(`^${WORK} {2}WORK_DRAFT$`, "m"));
  assert.equal(existsSync(join(root, ".buildbeat")), false);
  assert.equal(git(root, ["status", "--porcelain"]), "");
});

test("status of one work shows that work only", () => {
  const { root } = fixture({ prefix: "bb-simple-" });
  addWork(root, "WORK-B");
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  assert.equal(reviewWith(root, WORK).runId, "RUN-A-01");
  assert.equal(reviewWith(root, "WORK-B").runId, "RUN-B-01");
  const scoped = cli(["status", "--repo", root, "--work", WORK]).out;
  assert.match(scoped, /RUN-A-01/);
  assert.doesNotMatch(scoped, /WORK-B|RUN-B/);
});

test("a run id that only shares the prefix of the work's runs is not counted as one of them", () => {
  const { root, base } = fixture({ prefix: "bb-simple-" });
  const other = new EventLedger(ledgerPath(root, "RUN-A-OTHER-01"));
  other.append({
    type: "RUN_CREATED",
    actor: { kind: "kernel", id: "fixture" },
    run: "RUN-A-OTHER-01",
    work: "WORK-A-OTHER",
    data: { workflowRef: "software-delivery", workflowDigest: "sha256:x", base, riskPreset: "standard" },
  });
  const before = readFileSync(ledgerPath(root, "RUN-A-OTHER-01"), "utf8");
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const result = reviewWith(root, WORK);
  assert.equal(result.runId, "RUN-A-01");
  assert.equal(result.state.run.work, WORK);
  assert.equal(result.state.pendingHuman.transition, "enter-wait-merge");
  assert.equal(readFileSync(ledgerPath(root, "RUN-A-OTHER-01"), "utf8"), before);
});

test("a run an earlier version left waiting stays readable and cannot be approved or rejected", () => {
  const { root } = fixture({ prefix: "bb-simple-" });
  const sha = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  // No `pass`: the checks this run was held to are not on record.
  const ledger = new EventLedger(ledgerPath(root, "RUN-A-01"));
  const kernel = { kind: "kernel", id: "legacy-fixture" };
  ledger.append({
    type: "RUN_CREATED",
    actor: kernel,
    run: "RUN-A-01",
    work: WORK,
    data: { workflowRef: "software-delivery", workflowDigest: "sha256:legacy", base: sha, riskPreset: "standard" },
  });
  ledger.append({ type: "RUN_STARTED", actor: kernel, data: {} });
  ledger.append({
    type: "HUMAN_REQUESTED",
    actor: kernel,
    data: {
      transition: "enter-wait-merge",
      kind: "final-decision",
      subject: { candidate: sha, planDigest: "UNVERIFIED", evidenceDigest: "UNVERIFIED" },
      reasons: ["final decision"],
    },
  });
  const original = readFileSync(ledgerPath(root, "RUN-A-01"), "utf8");
  const decisions = jsonl(root, WORK, "decisions.jsonl");
  const nothingWaits = (error) =>
    error instanceof DecisionError && /no reviewed commit of WORK-A waits for a decision/.test(error.message);
  assert.throws(() => approveReview(root, WORK, { candidate: sha, by: "owner", as: "human" }), nothingWaits);
  assert.throws(() => rejectReview(root, WORK, { by: "owner", as: "human", reason: "old" }), nothingWaits);
  assert.equal(readFileSync(ledgerPath(root, "RUN-A-01"), "utf8"), original);
  assert.deepEqual(jsonl(root, WORK, "decisions.jsonl"), decisions);
  const row = statusRow(root, WORK);
  assert.equal(row.latest.id, "RUN-A-01");
  assert.equal(row.latest.status, "WAITING_HUMAN");
});

test("an approval is held to the severity floor frozen when the commit was reviewed", () => {
  const { root } = fixture({ prefix: "bb-simple-" });
  const sha = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const reviewed = reviewWith(root, WORK, {
    findings: [{ severity: "P2", summary: "src/feature.txt:1 needs a clearer label" }],
    checks: { maxSeverity: "P3" },
  });
  // A P2 does not count as blocking for the reviewer's round...
  assert.deepEqual(reviewed.state.pendingHuman.reasons, [
    "verified and reviewed with no blocking finding; the decision on this commit is the person's",
  ]);
  // ...but the work asked for nothing above P3, and the approval is refused.
  const decisions = jsonl(root, WORK, "decisions.jsonl");
  assert.throws(
    () => approveReview(root, WORK, { candidate: sha, by: "owner", as: "human" }),
    (error) => error instanceof DecisionError && /approval refused by policy: merge-evidence-floor \(1 finding\(s\) more severe than P3\)/.test(error.message),
  );
  assert.deepEqual(jsonl(root, WORK, "decisions.jsonl"), decisions);
  const state = EventLedger.open(reviewed.ledgerPath).state;
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.equal(state.terminal, null);
});

test("a checkout that fails the start check is discarded before anything is recorded", () => {
  const { root } = fixture({ prefix: "bb-simple-" });
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  assert.throws(
    () => reviewWith(root, WORK, {
      runId: "RUN-A-01",
      verifyCheckout: () => {
        throw new Error("checkout differs from the accepted artifact");
      },
    }),
    /checkout differs/,
  );
  assert.equal(existsSync(join(root, ".buildbeat/worktrees/RUN-A-01")), false);
  assert.equal(git(root, ["branch", "--list", "run/RUN-A-01"]), "");
  assert.equal(existsSync(ledgerPath(root, "RUN-A-01")), false);
  // The same run id is free again.
  const started = reviewWith(root, WORK, { runId: "RUN-A-01" });
  assert.equal(started.state.run.id, "RUN-A-01");
  assert.equal(started.state.run.status, "WAITING_HUMAN");
});

for (const mode of ["autocrlf", "attributes"]) {
  test(`the commit's work.md is compared as its checkout reads it, not as the raw blob (${mode})`, () => {
    const { root } = fixture({ prefix: "bb-simple-", accept: false });
    if (mode === "autocrlf") git(root, ["config", "core.autocrlf", "true"]);
    const acceptedText = readFileSync(join(root, WORK_REF), "utf8").replaceAll("\n", "\r\n");
    commit(root, "checkout line endings", {
      ".gitattributes": `*.sh text eol=lf\n${mode === "attributes" ? "*.md text eol=crlf\n" : ""}`,
      [WORK_REF]: acceptedText,
    });
    // LF in the repository, CRLF on disk.
    assert.doesNotMatch(git(root, ["show", `HEAD:${WORK_REF}`]), /\r/);
    assert.equal(readFileSync(join(root, WORK_REF), "utf8"), acceptedText);
    assert.equal(accept(root).status, 0);
    const sha = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
    const reviewed = review(root);
    assert.equal(reviewed.status, 0, reviewed.all);
    assert.match(reviewed.out, /status: WAITING_HUMAN/);
    assert.equal(statusRow(root, WORK).latest.candidate, sha);
  });
}

test("the commit's work.md is read with that commit's attributes, not with today's", () => {
  const { root, base } = fixture({ prefix: "bb-simple-", accept: false });
  const before = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  commit(root, "crlf attributes", { ".gitattributes": "*.md text eol=crlf\n" });
  // The main checkout now reads work.md with CRLF, and that is accepted.
  rmSync(join(root, WORK_REF));
  git(root, ["checkout", "--", WORK_REF]);
  assert.match(readFileSync(join(root, WORK_REF), "utf8"), /\r\n/);
  assert.equal(accept(root).status, 0);
  // The earlier commit has no such attribute: its checkout reads LF.
  const refused = review(root, WORK, ["--commit", before]);
  assert.equal(refused.status, 1);
  assert.match(refused.err, new RegExp(`commit ${before.slice(0, 7)} carries a different ${WORK_REF.replaceAll(".", "\\.")} than the accepted one`));
  assert.equal(existsSync(join(root, ".buildbeat", "runtime", "runs")), false);
  assert.equal(git(root, ["branch", "--list", "run/*"]), "");
  assert.notEqual(before, base);
});

test("an accepted work.md marked export-ignore is still reviewed: the check follows checkout, not archive", () => {
  const { root } = fixture({ prefix: "bb-simple-" });
  commit(root, "keep work records out of archives, add the feature", {
    ".gitattributes": `${WORK_REF} export-ignore\n`,
    "src/feature.txt": "hello\n",
  });
  const reviewed = review(root);
  assert.equal(reviewed.status, 0, reviewed.all);
  assert.match(reviewed.out, /status: WAITING_HUMAN/);
});

test("the commit named when the review starts is the one reviewed, even if a requires probe moves the branch", () => {
  const { root, base } = fixture({
    prefix: "bb-simple-",
    projectConfig: `${PROJECT_CONFIG}${yaml(["requires:", `  - probe: echo moved >> ${WORK_REF} && git commit -qam moved`])}`,
  });
  const sha = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const reviewed = cli(["review", "--repo", root, "--work", WORK], { cwd: root });
  assert.equal(reviewed.status, 0, reviewed.all);
  assert.notEqual(git(root, ["rev-parse", "HEAD"]), sha, "the probe moved HEAD");
  assert.match(reviewed.out, /status: WAITING_HUMAN/);
  const created = readFileSync(ledgerPath(root, "RUN-A-01"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((event) => event.type === "RUN_CREATED");
  assert.equal(created.data.base, base);
  const state = EventLedger.open(ledgerPath(root, "RUN-A-01")).state;
  assert.equal(state.workspaces["RUN-A-01"].candidate, sha);
  assert.equal(state.pendingHuman.subject.candidate, sha);
});

test("an accepted work.md larger than a pipe buffer is still reviewed", () => {
  const { root } = fixture({ prefix: "bb-simple-", accept: false });
  write(root, WORK_REF, `# Goal\nBuild feature.\n${"x".repeat(2 * 1024 * 1024)}\n`);
  commit(root, "large work description");
  assert.equal(accept(root).status, 0);
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const reviewed = review(root);
  assert.equal(reviewed.status, 0, reviewed.all);
  assert.match(reviewed.out, /status: WAITING_HUMAN/);
  assert.equal(statusRow(root, WORK).stage, "MERGE_DECISION");
});
