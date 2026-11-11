// `buildbeat accept`: the one thing a person accepts is the work's
// description, work.md, bound to the bytes it has at that moment.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { DecisionError, acceptWork } from "../src/runtime/decisions.js";
import { computeOverview } from "../src/runtime/overview.js";
import { WORK_MD, addWork, cli, emptyRepo, commit, jsonl, write } from "./support/review.js";

const WORK = "WORK-ACC";

function fixture() {
  const root = emptyRepo("bb-accept-");
  commit(root, "baseline", { "README.md": "fixture\n" });
  return root;
}

test("accept records the acceptance of work.md with its digest", () => {
  const root = fixture();
  addWork(root, WORK, { accept: false });
  const accepted = cli(["accept", "--repo", root, "--work", WORK, "--by", "owner", "--as", "human"]);
  assert.equal(accepted.status, 0, accepted.all);
  assert.match(accepted.out, /^accepted work as A-WORK-ACC-1 by owner \(person/m);
  assert.match(accepted.out, /^ {2}digest: sha256:[0-9a-f]{64}$/m);
  assert.match(accepted.out, /editing work\.md after acceptance makes its acceptance stale/);
  const [row] = jsonl(root, WORK, "decisions.jsonl");
  assert.equal(row.transition, "accept-work");
  assert.equal(row.decision, "approved");
  assert.equal(row.by, "owner");
  assert.deepEqual(row.subject, {
    artifact: "work",
    digest: `sha256:${createHash("sha256").update(WORK_MD, "utf8").digest("hex")}`,
  });
});

test("nothing but the work's description can be accepted", () => {
  const root = fixture();
  addWork(root, WORK, { accept: false });
  for (const artifact of ["intent", "plan", "intent,plan"]) {
    const refused = cli(["accept", "--repo", root, "--work", WORK, "--artifact", artifact, "--by", "owner"]);
    assert.equal(refused.status, 1, artifact);
    assert.match(refused.err, /accept records the acceptance of the work's description, work\.md/, artifact);
  }
  assert.equal(existsSync(join(root, "delivery", "work", WORK, "decisions.jsonl")), false);
});

test("a missing work.md accepts nothing", () => {
  const root = fixture();
  write(root, `delivery/work/${WORK}/notes.md`, "# notes\n");
  assert.throws(() => acceptWork(root, WORK, { by: "owner", as: "human" }), (error) =>
    error instanceof DecisionError && /artifact file missing: .*work\.md/.test(error.message));
  assert.equal(existsSync(join(root, "delivery", "work", WORK, "decisions.jsonl")), false);
});

test("status asks for the acceptance until work.md is accepted, and again once it is edited", () => {
  const root = fixture();
  addWork(root, WORK, { accept: false });
  const row = () => computeOverview(root, { repoLabel: "." })[0];
  assert.equal(row().stage, "WORK_DRAFT");
  assert.equal(row().next, "buildbeat accept --repo . --work WORK-ACC --by <you>");

  acceptWork(root, WORK, { by: "owner", as: "human" });
  assert.equal(row().stage, "READY_TO_RUN");

  write(root, `delivery/work/${WORK}/work.md`, `${readFileSync(join(root, "delivery", "work", WORK, "work.md"), "utf8")}\nOne more thing.\n`);
  assert.equal(row().stage, "WORK_STALE");
  assert.match(row().next, /^buildbeat accept --repo \. --work WORK-ACC --by <you> {3}# work\.md changed since acceptance$/);
});
