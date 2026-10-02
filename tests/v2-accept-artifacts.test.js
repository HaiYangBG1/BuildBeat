import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { acceptArtifacts } from "../src/v2/runtime/decisions.js";
import { computeOverview } from "../src/v2/runtime/overview.js";
import { tempDir } from "./support/tmp.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");

function fixture(files) {
  const root = tempDir("bb-v2-accept-");
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "pilot@example.com"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-q", "-m", "baseline"]);
  const dir = join(root, "delivery", "work", "WORK-ACC");
  mkdirSync(dir, { recursive: true });
  for (const name of files) {
    writeFileSync(join(dir, `${name}.md`), `# ${name}\n`);
  }
  return { root, decisions: join(dir, "decisions.jsonl") };
}

const lines = (path) => readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line));

test("one accept command records intent and plan, each with its own digest", () => {
  const { root, decisions } = fixture(["intent", "plan"]);
  const out = execFileSync("node", [CLI, "accept", "--repo", root, "--work", "WORK-ACC",
    "--artifact", "intent,plan", "--by", "owner"], { encoding: "utf8" });
  assert.match(out, /accepted intent as A-WORK-ACC-1/);
  assert.match(out, /accepted plan as A-WORK-ACC-2/);
  const rows = lines(decisions);
  assert.deepEqual(rows.map((row) => row.transition), ["accept-intent", "accept-plan"]);
  assert.notEqual(rows[0].subject.digest, rows[1].subject.digest);
  assert.ok(rows.every((row) => row.by === "owner"));
});

test("a missing artifact accepts nothing", () => {
  const { root, decisions } = fixture(["intent"]);
  assert.throws(() => acceptArtifacts(root, "WORK-ACC", ["intent", "plan"]), /artifact file missing: .*plan\.md/);
  assert.equal(existsSync(decisions), false);
});

test("overview suggests accepting intent and plan together until the intent is accepted", () => {
  const { root } = fixture(["intent", "plan"]);
  const [row] = computeOverview(root, { repoLabel: "." });
  assert.equal(row.stage, "PLAN_DRAFT");
  assert.match(row.next, /accept --repo \. --work WORK-ACC --artifact intent,plan --by <you>/);
  acceptArtifacts(root, "WORK-ACC", ["intent"]);
  const [after] = computeOverview(root, { repoLabel: "." });
  assert.match(after.next, /--artifact plan --by <you>/);
});
