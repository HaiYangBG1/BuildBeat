// `buildbeat check --work`: it reads the same things `review` will refuse on
// (the run config, the work's description and its acceptance), so a problem
// shows before a commit is sent. Real incident, twice: the check passed and
// the run stopped at once on a description nobody had accepted.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { acceptWork } from "../src/runtime/decisions.js";
import { cli, fixture, write, yaml } from "./support/review.js";

const WORK = "WORK-DOC";
const check = (root, extra = ["--work", WORK]) => cli(["check", "--repo", ".", ...extra], { cwd: root });

test("check says whether the work's description is there and accepted, as review will require", () => {
  const { root } = fixture({ prefix: "bb-check-", work: "WORK-OTHER" });

  const missing = check(root);
  assert.equal(missing.status, 1, missing.all);
  assert.match(missing.out, /^ {2}PROBLEM delivery\/work\/WORK-DOC\/work\.md is missing$/m);
  assert.doesNotMatch(missing.out, /^ready/m);

  write(root, `delivery/work/${WORK}/work.md`, "# why and how\n");
  const draft = check(root);
  assert.equal(draft.status, 1, draft.all);
  assert.match(draft.out, /^ {2}PROBLEM work\.md is not accepted: buildbeat accept --repo \. --work WORK-DOC --by <you>$/m);

  acceptWork(root, WORK, { by: "owner", as: "human" });
  const accepted = check(root);
  assert.equal(accepted.status, 0, accepted.all);
  assert.match(accepted.out, /^work\.md: accepted by owner \(person/m);
  assert.doesNotMatch(accepted.out, /PROBLEM/);
  assert.match(accepted.out, /^ready: commit the change, then buildbeat review --repo \. --work WORK-DOC$/m);

  write(root, `delivery/work/${WORK}/work.md`, "# why and how, and more\n");
  const stale = check(root);
  assert.equal(stale.status, 1, stale.all);
  assert.match(stale.out, /^ {2}PROBLEM work\.md is changed since its acceptance: buildbeat accept --repo \. --work WORK-DOC --by <you>$/m);

  // Nothing was run or recorded.
  assert.equal(existsSync(join(root, ".buildbeat")), false);
  assert.equal(existsSync(join(root, "delivery", "work", WORK, "runs")), false);
});

test("check names the files it read and what a review of the work will use", () => {
  const { root, work } = fixture({
    prefix: "bb-check-",
    workConfig: yaml([
      "allowedPaths:", "  - src", "maxReviewSeverity: P3",
      "workers:", "  verifier:", "    command: bash", "    timeoutMs: 120000", "    inheritEnv: true",
      "    args:", "      - -lc", "      - test -f src/other.txt",
    ]),
  });
  const project = check(root, []);
  assert.equal(project.status, 0, project.all);
  assert.match(project.out, /^run config: delivery\/run-config\.yaml$/m);
  assert.match(project.out, /^ {2}verifier: bash -lc test -f src\/feature\.txt$/m);
  assert.match(project.out, /^ {2}reviewer: sh tools\/reviewer\.sh$/m);
  assert.match(project.out, /^ {4}environment: allowlist; host credentials withheld$/m);
  assert.match(project.out, /^ {2}merge checks: accepted work\.md, verify passed on the commit, no undismissed finding above P2$/m);
  assert.match(project.out, /^ {2}release readback: none$/m);
  assert.match(project.out, /^ready$/m);

  const ofWork = check(root, ["--work", work]);
  assert.equal(ofWork.status, 0, ofWork.all);
  assert.match(ofWork.out, /^run config: delivery\/run-config\.yaml \+ delivery\/work\/WORK-A\/run-config\.yaml$/m);
  // The work swapped its verifier and kept the project's reviewer.
  assert.match(ofWork.out, /^ {2}verifier: bash -lc test -f src\/other\.txt \(timeout 2m\)$/m);
  assert.match(ofWork.out, /^ {4}environment: the host's \(inheritEnv: true\)$/m);
  assert.match(ofWork.out, /^ {2}reviewer: sh tools\/reviewer\.sh$/m);
  assert.match(ofWork.out, /no undismissed finding above P3$/m);
  assert.match(ofWork.out, /^ {2}allowed paths: src \(the work's own folder is always allowed\)$/m);
});
