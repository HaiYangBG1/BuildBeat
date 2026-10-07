import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { acceptArtifact } from "../src/v2/runtime/decisions.js";
import { computeOverview } from "../src/v2/runtime/overview.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { tempDir } from "./support/tmp.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");
const actor = { kind: "kernel", id: "test" };
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
function repo(root) {
  mkdirSync(root, { recursive: true });
  git(root, "init", "-q", "-b", "main");
  git(root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "--allow-empty", "-m", "fixture");
  return root;
}
function work(root, id, target = null, release = false) {
  const dir = join(root, "delivery", "work", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "work.md"), `# ${id}\n`);
  if (target) writeFileSync(join(dir, "run-config.yaml"), `repo: ${relative(dir, target)}\nwork: ${id}\n${release ? "release:\n  command: true\n" : ""}`);
  return dir;
}
function ledger(root, id, waiting = true) {
  const run = `RUN-${id}`;
  const log = EventLedger.open(join(root, ".buildbeat", "runtime", "runs", run, "events.jsonl"));
  log.append({ type: "RUN_CREATED", actor, run, work: id, data: {
    workflowRef: "software-delivery", workflowDigest: "sha256:test", base: git(root, "rev-parse", "HEAD"),
    riskPreset: "standard", deliveryChecks: { enabled: true },
  } });
  log.append({ type: "RUN_STARTED", actor, data: {} });
  if (waiting) log.append({ type: "HUMAN_REQUESTED", actor, data: {
    transition: "enter-fix", kind: "approval", subject: { candidate: git(root, "rev-parse", "HEAD"), planDigest: "sha256:plan", evidenceDigest: "sha256:evidence" }, reasons: ["test decision"],
  } });
  return log;
}
function archived(root, id) {
  const dir = join(root, "delivery", "work", id, "runs", `RUN-${id}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run-record.json"), JSON.stringify({ startedAt: "2026-10-01T00:00:00Z", terminal: { status: "SUCCEEDED" }, workspaces: { [`RUN-${id}`]: { candidate: git(root, "rev-parse", "HEAD") } } }));
}
function cli(cwd, ...args) {
  const out = spawnSync(process.execPath, [CLI, "status", "--repo", ".", ...args], { cwd, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout;
}
function snapshot(root) {
  const files = {};
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name), key = relative(root, file);
      if (entry.isSymbolicLink()) files[key] = readlinkSync(file);
      else if (entry.isDirectory()) { files[`${key}/`] = "directory"; visit(file); }
      else files[key] = createHash("sha256").update(readFileSync(file)).digest("hex");
    }
  }
  visit(root);
  return files;
}
function fixture() {
  const base = realpathSync(tempDir("bb-cross-repo-"));
  const main = repo(join(base, "main"));
  const a = repo(join(main, "code a's"));
  const b = repo(join(main, "code-b"));
  work(main, "SHARED", a);
  acceptArtifact(main, "SHARED", "work", { by: "owner" });
  work(a, "SHARED");
  writeFileSync(join(a, "delivery/work/SHARED/review-findings.jsonl"), JSON.stringify({ kind: "finding", severity: "P1", fingerprint: "target-only", summary: "target finding" }) + "\n");
  ledger(a, "SHARED");
  work(main, "DRAFT");
  work(main, "FUTURE", b);
  work(b, "ONLY-CODE");
  for (const [id, decision] of [["DONE", "closed"], ["CANCEL", "cancelled"]]) {
    const dir = work(b, id);
    writeFileSync(join(dir, "decisions.jsonl"), `${JSON.stringify({ transition: "close-work", decision })}\n`);
  }
  work(b, "MERGED", b);
  archived(b, "MERGED");
  work(main, "RELEASE", b, true);
  work(b, "RELEASE");
  archived(b, "RELEASE");
  return { base, main, a, b };
}

test("all-repos merges authoritative work facts, keeps drafts and counts settled works; commands resolve from the caller", () => {
  const { base, main, a, b } = fixture();
  const before = snapshot(base);
  const result = JSON.parse(cli(main, "--all-repos", "--json"));
  assert.deepEqual(Object.keys(result), ["repos", "pending", "warnings"]);
  assert.equal(result.repos.length, 3);
  assert.deepEqual(result.warnings, []);
  const rows = result.repos.flatMap((group) => group.works);
  const shared = rows.filter((row) => row.work === "SHARED");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].repo, a);
  assert.equal(shared[0].stage, "WAITING_HUMAN");
  assert.equal(shared[0].openFindings, 1);
  assert.equal(shared[0].findings[0].fingerprint, "target-only");
  assert.equal(shared[0].config, join(main, "delivery/work/SHARED/run-config.yaml"));
  assert.equal(rows.find((row) => row.work === "DRAFT").repo, main);
  assert.equal(rows.find((row) => row.work === "ONLY-CODE").repo, b);
  assert.equal(rows.find((row) => row.work === "FUTURE").targetRepo, b);
  assert.equal(rows.find((row) => row.work === "FUTURE").repo, main);
  assert.equal(rows.find((row) => row.work === "RELEASE").hasRelease, true);
  assert.deepEqual(result.repos.find((group) => group.repo === b).settled, { total: 3, closed: 1, cancelled: 1, merged: 1 });
  assert.equal(result.pending.length, 1);
  assert.equal(result.pending[0].repo, a);
  const text = cli(main, "--all-repos");
  assert.ok(text.indexOf("待人决定") < text.indexOf("仓库："));
  assert.match(text, /RELEASE  MERGED/);
  assert.doesNotMatch(text, /(?:DONE  CLOSED|CANCEL  CANCELLED|MERGED  MERGED)/);
  assert.match(text, /已了结 3 项（CLOSED 1 \/ CANCELLED 1 \/ 已合并无收尾步骤 1）/);
  assert.match(text, /运行目标：code-b/);
  assert.match(text, /--config delivery\/work\/SHARED\/run-config.yaml/);
  // Parse the rendered shell arguments with the real shell. Substitute a
  // harmless printf function, so approving/rejecting is never actually done.
  for (const action of ["approve", "reject"]) {
    const command = text.split("\n").find((line) => line.includes(`buildbeat decide --action ${action}`)).trim().replace(/^next: /, "");
    const executable = command.split("   #")[0].replaceAll("<you>", "owner").replaceAll("<why>", "reason");
    const args = execFileSync("sh", ["-c", `buildbeat() { printf '%s\\n' "$@"; }; ${executable}`], { cwd: main, encoding: "utf8" }).trim().split("\n");
    assert.equal(args[args.indexOf("--repo") + 1], "code a's");
    assert.equal(args[args.indexOf("--run") + 1], "RUN-SHARED");
  }
  const single = JSON.parse(cli(main, "--work", "SHARED", "--json"));
  assert.equal(single.works[0].stage, "WAITING_HUMAN");
  assert.equal(single.pending[0].repo, a);
  assert.doesNotMatch(cli(main, "--work", "SHARED"), /READY_TO_RUN/);
  assert.equal(computeOverview(main, { work: "SHARED" })[0].repo, a);
  const filtered = JSON.parse(cli(main, "--all-repos", "--work", "SHARED", "--json"));
  assert.deepEqual(filtered.repos.flatMap((group) => group.works).map((row) => row.work), ["SHARED"]);
  assert.equal(filtered.pending.length, 1);
  const invalid = spawnSync(process.execPath, [CLI, "status", "--repo", main, "--all-repos", "--run", "RUN-SHARED"], { encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /--all-repos.*--run.*--work/);
  assert.deepEqual(snapshot(base), before, "every file and directory in every repo is unchanged");
});

test("discovery is one-level, deduplicates real paths, warns without failing and supports ledger-only targets", () => {
  const { base, main, a, b } = fixture();
  symlinkSync(a, join(main, "alias"));
  work(main, "ALIAS", join(main, "alias"));
  work(main, "MISSING", join(base, "missing"));
  const nonrepo = join(base, "plain");
  mkdirSync(nonrepo);
  work(main, "NONREPO", nonrepo);
  const broken = work(main, "BROKEN");
  writeFileSync(join(broken, "run-config.yaml"), "repo: [invalid]\n");
  // A ledger alone establishes target ownership, including live state when
  // there is no work artifact in that checkout.
  work(main, "LEDGER", b);
  ledger(b, "LEDGER", false);
  const nested = repo(join(b, "nested"));
  work(nested, "DEEP");
  work(b, "POINTER", nested);
  const before = snapshot(base);
  const result = JSON.parse(cli(main, "--all-repos", "--json"));
  assert.equal(result.repos.length, 3);
  assert.equal(result.warnings.length, 3);
  const rows = result.repos.flatMap((group) => group.works);
  assert.equal(rows.find((row) => row.work === "LEDGER").repo, b);
  assert.equal(rows.find((row) => row.work === "LEDGER").stage, "RUNNING");
  assert.equal(rows.some((row) => row.work === "DEEP"), false);
  assert.equal(cli(main, "--all-repos").split("\n").filter((line) => line.startsWith("warning:")).length, 3);
  assert.match(cli(main, "--all-repos"), /DRAFT  WORK_DRAFT/);
  assert.deepEqual(snapshot(base), before);
});


test("external targets and config-only entries work from another cwd; stalled runs stay visible", () => {
  const base = realpathSync(tempDir("bb-cross-external-"));
  const main = repo(join(base, "main repo"));
  const target = repo(join(base, "outside repo"));
  const dir = work(main, "EXTERNAL", target, true);
  rmSync(join(dir, "work.md"));
  work(target, "EXTERNAL");
  archived(target, "EXTERNAL");
  work(target, "STUCK");
  const log = ledger(target, "STUCK", false);
  log.append({ type: "WORKSPACE_BOUND", actor, data: { workspaceId: "test", repo: ".", branch: "run/RUN-STUCK", worktreePath: ".buildbeat/worktrees/RUN-STUCK", base: git(target, "rev-parse", "HEAD") } });
  log.append({ type: "STEP_STARTED", actor, ts: "2020-01-01T00:00:00Z", data: { step: "build", attempt: 1, worker: "builder", adapter: "test", workspaceId: "test" } });
  const before = snapshot(base);
  const out = spawnSync(process.execPath, [CLI, "status", "--repo", "main repo", "--all-repos", "--json"], { cwd: base, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  const result = JSON.parse(out.stdout);
  assert.equal(result.repos.length, 2);
  const rows = result.repos.flatMap((group) => group.works);
  assert.equal(rows.filter((row) => row.work === "EXTERNAL").length, 1);
  assert.match(rows.find((row) => row.work === "EXTERNAL").next, /--config 'main repo\/delivery\/work\/EXTERNAL\/run-config.yaml'/);
  assert.equal(rows.find((row) => row.work === "STUCK").stage, "STALLED");
  assert.match(rows.find((row) => row.work === "STUCK").next, /--repo 'outside repo' --run RUN-STUCK/);
  assert.deepEqual(snapshot(base), before);
});
