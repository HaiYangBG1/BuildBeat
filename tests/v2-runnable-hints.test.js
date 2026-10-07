// Every command and path a hint or the quickstart gives must work as
// written. Real incident (first run of a fresh project on 4.0.0 with real
// codex workers): after the merge, status told the person to run
// `buildbeat release --config …`, which fails without a release: section,
// so the work could never close; the template comment and `check` still
// named 3.x commands; the quickstart did not say where the templates live.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { tempDir } from "./support/tmp.js";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "bin", "buildbeat.js");
const actor = { kind: "kernel", id: "test" };
const NOTHING_LEFT =
  "merged; no release readback configured, nothing left to do (add a release: section to the run config to record a readback and close the window)";

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
const config = (id, extra = "") => `repo: ../../..\nwork: ${id}\n${extra}`;

test("a merged work whose run configs have no release: section has nothing left to do", () => {
  const root = repo();
  work(root, "PLAIN", { "run-config.yaml": config("PLAIN") });
  archived(root, "PLAIN", "SUCCEEDED");
  const plain = row(root, "PLAIN");
  assert.equal(plain.stage, "MERGED");
  assert.equal(plain.next, NOTHING_LEFT);
  assert.doesNotMatch(plain.next, /buildbeat release --config/);
  assert.match(cli(root, "status", "--repo", ".", "--work", "PLAIN"), /next: merged; no release readback configured, nothing left to do/);
});

test("a merged work with a release: section points at the config that has it", () => {
  const root = repo();
  // run-config.yaml sorts before run-config_ship.yaml; the hint must not
  // name the first file just because it comes first.
  work(root, "SHIP", {
    "run-config.yaml": config("SHIP"),
    "run-config_ship.yaml": config("SHIP", "release:\n  command: true\n"),
  });
  archived(root, "SHIP", "SUCCEEDED");
  const ship = row(root, "SHIP");
  assert.equal(ship.stage, "MERGED");
  assert.match(ship.next, /release it \(a human action\), then buildbeat release --config delivery\/work\/SHIP\/run-config_ship\.yaml; then buildbeat decide --repo \. --work SHIP --action close/);
});

test("an unreadable run config keeps the generic release hint", () => {
  const root = repo();
  work(root, "BROKEN", { "run-config.yaml": "repo: [\n" });
  archived(root, "BROKEN", "SUCCEEDED");
  const broken = row(root, "BROKEN");
  assert.equal(broken.stage, "MERGED");
  assert.notEqual(broken.next, NOTHING_LEFT);
  assert.match(broken.next, /buildbeat release --config delivery\/work\/BROKEN\/run-config\.yaml/);
});

test("a waiting run without reply commands falls back to status, not the 3.x inbox", () => {
  const root = repo();
  work(root, "WAIT");
  archived(root, "WAIT", "WAITING_HUMAN");
  const wait = row(root, "WAIT");
  assert.equal(wait.stage, "WAITING_HUMAN");
  assert.equal(wait.next, "buildbeat status --repo . --work WAIT");
});

test("a work directory without a work description stays NO_INTENT even with runs; a ledger-only work shows its run", () => {
  const root = repo();
  // Shape of an early acceptance work: only archived runs, no work.md.
  work(root, "OLD", {}, { description: false });
  archived(root, "OLD", "CANCELLED");
  const old = row(root, "OLD");
  assert.equal(old.stage, "NO_INTENT");
  assert.equal(old.next, "write delivery/work/OLD/work.md (goal, scope, acceptance, implementation plan)");

  const log = EventLedger.open(join(root, ".buildbeat", "runtime", "runs", "RUN-LEDGER-ONLY-01", "events.jsonl"));
  log.append({ type: "RUN_CREATED", actor, run: "RUN-LEDGER-ONLY-01", work: "LEDGER-ONLY", data: {
    workflowRef: "software-delivery", workflowDigest: "sha256:test", base: git(root, "rev-parse", "HEAD"),
    riskPreset: "standard", deliveryChecks: { enabled: true },
  } });
  log.append({ type: "RUN_STARTED", actor, data: {} });
  const ledgerOnly = row(root, "LEDGER-ONLY");
  assert.equal(ledgerOnly.stage, "RUNNING");
});

test("check names the 4.0 status command when no notification channel is configured", () => {
  const root = repo();
  const dir = work(root, "CHECK");
  writeFileSync(
    join(dir, "run-config.yaml"),
    readFileSync(join(ROOT, "templates", "v2", "run-config.example.yaml"), "utf8").replace("work: WORK-X", "work: CHECK"),
  );
  cpSync(join(ROOT, "templates", "v2", "envelope"), join(root, "delivery", "envelope"), { recursive: true });
  const out = cli(root, "check", "--config", join(dir, "run-config.yaml"));
  assert.match(out, /notify: none .*until someone runs status\)/);
  assert.doesNotMatch(out, /\binbox\b/);
});

test("the run config template and its verbatim copies use 4.0 command names", () => {
  const read = (path) => readFileSync(join(ROOT, path), "utf8");
  const START = "# 起跑前：buildbeat check --config <本文件>；起跑：buildbeat run --config <本文件>";
  const FAMILY = "# 家族名；run 自动编成 RUN-X-01/02…，--new 开新一轮";
  const OLD = /buildbeat doctor --config|buildbeat start --config|--attempt new 自动编成/;
  for (const path of [
    "templates/v2/run-config.example.yaml",
    "SKILL.md",
    "docs/v2/guide/01-quickstart.md",
    "docs/v2/guide/01-quickstart.en.md",
  ]) {
    const text = read(path);
    assert.ok(text.includes(START), `${path} carries the template's start comment`);
    assert.ok(text.includes(FAMILY), `${path} carries the template's run family comment`);
    assert.doesNotMatch(text, OLD, `${path} names a 3.x command`);
  }
  const example = read("example/delivery/work/WORK-EXPORT-DATE-FILTER/run-config.yaml");
  assert.ok(example.includes(START));
  assert.doesNotMatch(example, OLD);
});

test("the quickstart names where the shipped templates live, and every file it names ships", () => {
  const shipped = new Set(readFileSync(join(ROOT, "tests", "support", "package-files.txt"), "utf8").split("\n"));
  for (const path of ["docs/v2/guide/01-quickstart.md", "docs/v2/guide/01-quickstart.en.md"]) {
    const text = readFileSync(join(ROOT, path), "utf8");
    assert.ok(text.includes("`$(npm root -g)/@haiyangbg/buildbeat/templates/`"), `${path} names the install location`);
    assert.match(text, /`gitignore\.template`[^\n]*`templates\/`/, `${path} says the gitignore template sits in templates/`);
  }
  for (const file of [
    "templates/gitignore.template",
    "templates/v2/AGENTS.md",
    "templates/v2/CLAUDE.md",
    "templates/v2/work.example.md",
    "templates/v2/run-config.example.yaml",
    "templates/v2/envelope/worker.sh",
    "templates/v2/envelope/prompts/builder.md",
    "templates/v2/envelope/prompts/reviewer.md",
    "templates/v2/envelope/prompts/fixer.md",
  ]) {
    assert.ok(shipped.has(file), `${file} is in the published package`);
  }
});
