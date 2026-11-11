// `buildbeat status`: where each work stands and what comes next, derived
// from the work folders in Git and the run ledgers on this machine.

import assert from "node:assert/strict";
import { appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { acceptWork } from "../src/runtime/decisions.js";
import { computeOverview } from "../src/runtime/overview.js";
import { addWork, approved, cli, commit, emptyRepo, git, reviewWith, write } from "./support/review.js";

function byWork(rows) {
  return Object.fromEntries(rows.map((row) => [row.work, row]));
}

function closeRow(root, work, row) {
  appendFileSync(join(root, "delivery", "work", work, "decisions.jsonl"), `${JSON.stringify({ transition: "close-work", by: "owner", ...row })}\n`);
}

test("status derives each work's stage and next move from its records, its runs and the branch", () => {
  // No project run config here: the reviews below go through the runtime.
  const root = emptyRepo("bb-overview-");
  commit(root, "baseline", { ".gitignore": ".buildbeat/\n", "README.md": "fixture\n" });

  // A new draft: notes and a run config, no work.md yet. And a folder an
  // earlier version left records in.
  write(root, "delivery/work/WORK-A/notes.md", "not a description\n");
  write(root, "delivery/work/WORK-A/run-config.yaml", "allowedPaths:\n  - src\n");
  write(root, "delivery/work/WORK-L/intent.md", "# WORK-L\n");
  write(root, "delivery/work/WORK-L/plan.md", "# plan WORK-L\n");
  write(root, "delivery/work/WORK-L/decisions.jsonl", `${JSON.stringify({ transition: "accept-intent", decision: "approved", by: "owner" })}\n`);
  // An old-format draft nobody decided anything on yet.
  write(root, "delivery/work/WORK-L2/intent.md", "# WORK-L2\n");
  addWork(root, "WORK-B", { accept: false });
  addWork(root, "WORK-C");
  write(root, "delivery/work/WORK-C/work.md", "# edited after acceptance\n");
  addWork(root, "WORK-D");
  write(root, "delivery/work/WORK-D/env-facts.md", "- redis >= 7\n");
  addWork(root, "WORK-H");
  closeRow(root, "WORK-H", { ts: "2026-09-03T12:34:05Z", decision: "closed", subject: { result: "doc-only work shipped via main" } });
  addWork(root, "WORK-I");
  closeRow(root, "WORK-I", { ts: "2026-09-05T04:05:00Z", decision: "cancelled", subject: { result: "cost > benefit" } });
  addWork(root, "WORK-E");
  addWork(root, "WORK-F");
  addWork(root, "WORK-G", { workConfig: "release:\n  command: \"true\"\n" });
  commit(root, "records");

  // WORK-G: approved, and its commit is on main.
  const merged = approved(root, "WORK-G", { "src/g.txt": "g\n" });
  // WORK-E: reviewed, waiting for the person.
  const waiting = commit(root, "change for WORK-E\n\nWork: WORK-E", { "src/e.txt": "e\n" });
  assert.equal(reviewWith(root, "WORK-E").state.pendingHuman.kind, "final-decision");
  // WORK-F: approved, but its commit is only on a side branch.
  const side = approved(root, "WORK-F", { "src/f.txt": "f\n" });
  git(root, ["update-ref", "refs/heads/side", side.sha]);
  git(root, ["reset", "-q", "--soft", "HEAD~1"]);

  const rows = byWork(computeOverview(root, { repoLabel: "." }));
  assert.equal(rows["WORK-A"].stage, "NO_INTENT");
  assert.match(rows["WORK-A"].next, /^write delivery\/work\/WORK-A\/work\.md /);
  assert.equal(rows["WORK-L"].stage, "LEGACY");
  assert.match(rows["WORK-L"].next, /^legacy records: /);
  assert.equal(rows["WORK-L2"].stage, "LEGACY");
  assert.equal(rows["WORK-B"].stage, "WORK_DRAFT");
  assert.equal(rows["WORK-B"].next, "buildbeat accept --repo . --work WORK-B --by <you>");
  assert.equal(rows["WORK-C"].stage, "WORK_STALE");
  assert.equal(rows["WORK-C"].plan.stale, true);
  assert.match(rows["WORK-C"].next, /accept --repo \. --work WORK-C --by <you> {3}# work\.md changed since acceptance$/);
  assert.equal(rows["WORK-D"].stage, "READY_TO_RUN");
  assert.match(rows["WORK-D"].next, /^write delivery\/run-config\.yaml \(workers\.verifier, workers\.reviewer\), then buildbeat review --repo \. --work WORK-D; or, /);
  assert.match(rows["WORK-D"].next, /if it was doc-only, close out: write delivery\/work\/WORK-D\/result\.md, then buildbeat decide --repo \. --work WORK-D --action close --by <you>$/);
  assert.equal(rows["WORK-D"].envFacts, true);
  assert.equal(rows["WORK-H"].stage, "CLOSED");
  assert.match(rows["WORK-H"].next, /^closed @ 2026-09-03T12:34:05Z: doc-only work shipped via main$/);
  assert.equal(rows["WORK-I"].stage, "CANCELLED");
  assert.match(rows["WORK-I"].next, /^cancelled @ .*cost > benefit$/);
  assert.equal(rows["WORK-E"].stage, "MERGE_DECISION");
  assert.equal(rows["WORK-E"].next, `buildbeat decide --repo . --work WORK-E --action approve --candidate ${waiting} --by <you>`);
  assert.equal(rows["WORK-F"].stage, "MERGE_READY");
  assert.equal(rows["WORK-F"].next, `approved ${side.sha.slice(0, 7)} is not on main; merge it — manual, then push`);
  assert.equal(rows["WORK-G"].stage, "MERGED");
  assert.equal(rows["WORK-G"].merged, true);
  assert.equal(rows["WORK-G"].mergedCandidate, merged.sha);

  // With the runtime directory gone, the run records in Git tell the same.
  rmSync(join(root, ".buildbeat", "runtime"), { recursive: true, force: true });
  const after = byWork(computeOverview(root, { repoLabel: "." }));
  assert.equal(after["WORK-G"].stage, "MERGED");
  assert.equal(after["WORK-G"].latest.source, "run-record");
  assert.equal(after["WORK-F"].stage, "MERGE_READY");

  const text = cli(["status", "--repo", root]);
  assert.equal(text.status, 0, text.all);
  assert.match(text.out, /^WORK-G {2}MERGED$/m);
  assert.match(text.out, /^WORK-H {2}CLOSED$/m);
  assert.match(text.out, /^WORK-L {2}LEGACY\n {2}legacy records · runs 0$/m);
  assert.match(text.out, /^ {2}work\.md ✓ · runs 1$/m);
  assert.match(text.out, /^ {2}work\.md stale · runs 0$/m);
  assert.match(text.out, /next: candidate \w{7} \(RUN-G-01\) is on main; release it \(a human action\), then buildbeat release --repo \S+ --work WORK-G; then write /);
  // Copyable commands never carry this machine's path.
  assert.doesNotMatch(text.out, new RegExp(root));
  const one = cli(["status", "--repo", root, "--work", "WORK-A", "--json"]);
  assert.equal(JSON.parse(one.out).works.length, 1);

  // Accepting the edited description makes the work ready again.
  acceptWork(root, "WORK-C", { by: "owner", as: "human" });
  assert.equal(computeOverview(root, { work: "WORK-C" })[0].stage, "READY_TO_RUN");
});
