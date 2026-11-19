// Reviews that keep finding blocking problems: every fifth one in a row,
// `review` tells the session to stop and ask the user (WORK-REVIEW-CIRCLING).

import assert from "node:assert/strict";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { computeWorkCost } from "../src/runtime/work-cost.js";
import { cli, commit, fixture, review, reviewWith, statusRow, worker } from "./support/review.js";

const STOP = /^stop: (\d+) reviews in a row found blocking problems; before fixing again, show the user where they keep coming from and ask whether to narrow the work, rule on the findings, or keep fixing$/m;

let round = 0;
// One more commit of the work that the fixture's reviewer finds a P1 in.
function blockingCommit(root, work) {
  round += 1;
  commit(root, `try ${round}\n\nWork: ${work}`, {
    "src/feature.txt": `try ${round}\n`,
    "findings.json": JSON.stringify({ findings: [{ severity: "P1", summary: `still wrong ${round}` }] }),
  });
}

const streakLine = (root, work) =>
  cli(["status", "--repo", root, "--work", work]).out.match(/^ {2}blocking streak: .*$/m)?.[0] ?? null;

test("every fifth blocking review in a row tells the session to stop and ask", () => {
  const { root, work } = fixture({ prefix: "bb-circling-" });
  assert.equal(statusRow(root, work).blockingStreak, 0);
  assert.equal(streakLine(root, work), null);

  for (let n = 1; n <= 10; n += 1) {
    blockingCommit(root, work);
    const out = review(root, work).all;
    if (n % 5 === 0) {
      assert.equal(out.match(STOP)?.[1], String(n), out);
    } else {
      assert.doesNotMatch(out, /^stop:/m, `round ${n}`);
    }
    assert.equal(statusRow(root, work).blockingStreak, n);
    assert.equal(streakLine(root, work), `  blocking streak: ${n} review${n === 1 ? "" : "s"} in a row found blocking problems`);
  }

  // Superseded runs are counted from their run records once their runtime
  // is gone; the latest one, still waiting, has only its ledger.
  const latest = statusRow(root, work).latest.id;
  const runsDir = join(root, ".buildbeat", "runtime", "runs");
  for (const entry of readdirSync(runsDir)) {
    if (entry !== latest) rmSync(join(runsDir, entry), { recursive: true, force: true });
  }
  assert.equal(computeWorkCost(root, work).blockingStreak, 10);
});

test("a round that reviewed nothing is skipped; a clean review ends the streak", () => {
  const { root, work } = fixture({ prefix: "bb-circling-" });
  const p1 = [{ severity: "P1", summary: "wrong" }];
  for (let n = 0; n < 4; n += 1) {
    commit(root, `try\n\nWork: ${work}`, { "src/feature.txt": `try ${n}\n` });
    reviewWith(root, work, { findings: p1 });
  }
  assert.equal(computeWorkCost(root, work).blockingStreak, 4);

  // Verification fails: nothing was reviewed, the streak stands.
  commit(root, `broken\n\nWork: ${work}`, { "src/feature.txt": "broken\n" });
  const failed = reviewWith(root, work, { verifier: worker({ exitCode: 1 }) });
  assert.equal(failed.state.terminal.status, "FAILED");
  assert.equal(computeWorkCost(root, work).blockingStreak, 4);

  // The fifth blocking review after it still counts as the fifth.
  blockingCommit(root, work);
  assert.equal(review(root, work).all.match(STOP)?.[1], "5");

  // A review with no blocking finding ends it; the next one starts at 1.
  commit(root, `fixed\n\nWork: ${work}`, { "src/feature.txt": "fixed\n", "findings.json": null });
  assert.doesNotMatch(review(root, work).all, /^stop:/m);
  assert.equal(statusRow(root, work).blockingStreak, 0);
  assert.equal(streakLine(root, work), null);
  blockingCommit(root, work);
  review(root, work);
  assert.equal(statusRow(root, work).blockingStreak, 1);
});
