// Every command and path a hint or the quickstart gives must work as
// written. Once, after a merge, status told the person to run the release
// readback of a work that declared none, so the work could never close; the
// template comment still named commands of an earlier version; the
// quickstart did not say where the templates live.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { EventLedger } from "../src/storage/event-ledger.js";
import { tempDir } from "./support/tmp.js";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "bin", "buildbeat.js");
const actor = { kind: "kernel", id: "test" };
// Since close-out: a merged work without a release closes with its result
// page instead of having "nothing left to do".
const CLOSE_OUT =
  "merged; close out: write delivery/work/PLAIN/result.md, then buildbeat decide --repo . --work PLAIN --action close --by <you>";

function fixtureEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  return { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: "/dev/null",
    GIT_CONFIG_KEY_1: "commit.gpgSign", GIT_CONFIG_VALUE_1: "false" };
}
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: fixtureEnv() }).trim();

function repo() {
  const root = realpathSync(tempDir("bb-hints-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "--allow-empty", "-m", "fixture");
  return root;
}
function work(root, id, files = {}, { description = true } = {}) {
  const dir = join(root, "delivery", "work", id);
  mkdirSync(dir, { recursive: true });
  if (description) writeFileSync(join(dir, "work.md"), `# ${id}\n`);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}
function archived(root, id, status) {
  const run = `RUN-${id}-01`;
  const dir = join(root, "delivery", "work", id, "runs", run);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run-record.json"), JSON.stringify({
    startedAt: "2026-10-01T00:00:00Z",
    terminal: { status },
    workspaces: { [run]: { candidate: git(root, "rev-parse", "HEAD") } },
  }));
}
function cli(cwd, ...args) {
  const out = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: fixtureEnv() });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout;
}
const row = (root, id) => JSON.parse(cli(root, "status", "--repo", ".", "--work", id, "--json")).works[0];
// A work's own run config: what it overrides of the project's.
const config = (extra = "") => `allowedPaths:\n  - src\n${extra}`;
// A run ledger written by hand: a run that started and has not ended.
function running(root, id, run) {
  const log = EventLedger.open(join(root, ".buildbeat", "runtime", "runs", run, "events.jsonl"));
  log.append({ type: "RUN_CREATED", actor, run, work: id, data: {
    workflowRef: "software-delivery", workflowDigest: "sha256:test", base: git(root, "rev-parse", "HEAD"),
    riskPreset: "standard", deliveryChecks: { enabled: true },
  } });
  log.append({ type: "RUN_STARTED", actor, data: {} });
}

test("a merged work whose run config has no release: section closes out with its result page", () => {
  const root = repo();
  work(root, "PLAIN", { "run-config.yaml": config() });
  archived(root, "PLAIN", "SUCCEEDED");
  const plain = row(root, "PLAIN");
  assert.equal(plain.stage, "MERGED");
  assert.equal(plain.next, CLOSE_OUT);
  assert.doesNotMatch(plain.next, /buildbeat release/);
  assert.match(cli(root, "status", "--repo", ".", "--work", "PLAIN"), /next: merged; close out: write delivery\/work\/PLAIN\/result\.md/);
});

test("a merged work with a release: section is told to release, read it back, then close out", () => {
  const root = repo();
  work(root, "SHIP", { "run-config.yaml": config("release:\n  command: true\n") });
  archived(root, "SHIP", "SUCCEEDED");
  const ship = row(root, "SHIP");
  assert.equal(ship.stage, "MERGED");
  assert.match(ship.next, /release it \(a human action\), then buildbeat release --repo \. --work SHIP; then write delivery\/work\/SHIP\/result\.md, then buildbeat decide --repo \. --work SHIP --action close --by <you>$/);
});

test("an unreadable run config keeps the release hint", () => {
  const root = repo();
  work(root, "BROKEN", { "run-config.yaml": "release: [\n" });
  archived(root, "BROKEN", "SUCCEEDED");
  const broken = row(root, "BROKEN");
  assert.equal(broken.stage, "MERGED");
  assert.doesNotMatch(broken.next, /^merged; close out:/);
  assert.match(broken.next, /release it \(a human action\), then buildbeat release --repo \. --work BROKEN; /);
});

test("a waiting run without reply commands falls back to status", () => {
  const root = repo();
  work(root, "WAIT");
  archived(root, "WAIT", "WAITING_HUMAN");
  const wait = row(root, "WAIT");
  assert.equal(wait.stage, "WAITING_HUMAN");
  assert.equal(wait.next, "buildbeat status --repo . --work WAIT");
});

test("a folder without work.md is NO_INTENT even with a run, or LEGACY when it holds records; a work known only from a ledger shows its run", () => {
  const root = repo();
  work(root, "BARE", { "notes.md": "notes\n" }, { description: false });
  running(root, "BARE", "RUN-BARE-01");
  const bare = row(root, "BARE");
  assert.equal(bare.stage, "NO_INTENT");
  assert.equal(bare.next, "write delivery/work/BARE/work.md (goal, scope, acceptance, implementation plan)");

  // Shape of a work an earlier version ran: run records, no work.md.
  work(root, "OLD", {}, { description: false });
  archived(root, "OLD", "CANCELLED");
  const old = row(root, "OLD");
  assert.equal(old.stage, "LEGACY");
  assert.equal(old.next, "legacy records: read the folder, or close it with a result.md");

  running(root, "LEDGER-ONLY", "RUN-LEDGER-ONLY-01");
  const ledgerOnly = row(root, "LEDGER-ONLY");
  assert.equal(ledgerOnly.stage, "RUNNING");
  assert.equal(ledgerOnly.next, "buildbeat status --repo . --run RUN-LEDGER-ONLY-01");
});

test("the run config template, the example and the documents that explain them name only current commands", () => {
  const read = (path) => readFileSync(join(ROOT, path), "utf8");
  const NEXT = "# 写好后：buildbeat check --repo .；送审一个提交：buildbeat review --repo . --work <WORK-ID>";
  const OLD = /buildbeat (?:doctor|start|run|resume|stop|approve|reject|overview|inbox)\b|--config\b|--adopt\b/;
  assert.ok(read("templates/run-config.example.yaml").includes(NEXT), "the template says what to run next");
  for (const path of [
    "templates/run-config.example.yaml",
    "example/delivery/run-config.yaml",
    "example/delivery/work/WORK-EXPORT-DATE-FILTER/run-config.yaml",
    "example/README.md",
    "SKILL.md",
    "docs/guide/01-quickstart.md",
    "docs/guide/01-quickstart.en.md",
  ]) {
    assert.doesNotMatch(read(path), OLD, `${path} names a removed command or flag`);
  }
});

test("the quickstart names where the shipped templates live, and every file it names ships", () => {
  const shipped = new Set(readFileSync(join(ROOT, "tests", "support", "package-files.txt"), "utf8").split("\n"));
  for (const path of ["docs/guide/01-quickstart.md", "docs/guide/01-quickstart.en.md"]) {
    const text = readFileSync(join(ROOT, path), "utf8");
    assert.ok(text.includes("`$(npm root -g)/@haiyangbg/buildbeat/templates/`"), `${path} names the install location`);
    assert.match(text, /`gitignore\.template`[^\n]*`templates\/`/, `${path} says the gitignore template sits in templates/`);
  }
  for (const file of [
    "templates/gitignore.template",
    "templates/AGENTS.md",
    "templates/CLAUDE.md",
    "templates/work.example.md",
    "templates/result.example.md",
    "templates/run-config.example.yaml",
    "templates/envelope/worker.sh",
    "templates/envelope/prompts/reviewer.md",
  ]) {
    assert.ok(shipped.has(file), `${file} is in the published package`);
  }
});
