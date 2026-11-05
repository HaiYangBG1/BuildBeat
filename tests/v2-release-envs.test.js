// Release environments (WORK-RELEASE-ENVS): `release --env` records the
// environment and hands it to the readback command, `status --releases`
// says what runs where from the readbacks recorded, and a work done without
// a run can be read back against its newest code commit through a config
// that only records releases. Real cost behind it: in a pilot repository
// 143 of 164 works held per-environment, per-step folders, 19 works held 57
// release configs copied per environment and step, which version ran where
// lived only in one person's notes, and a work with a release: section but
// no run could neither record a readback nor close.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkRunConfigShape } from "../src/v2/cli/run-config-check.js";
import { tempDir } from "./support/tmp.js";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "bin", "buildbeat.js");

function fixtureEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  return { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: "/dev/null",
    GIT_CONFIG_KEY_1: "commit.gpgSign", GIT_CONFIG_VALUE_1: "false" };
}
const IDENTITY = ["-c", "user.name=Test", "-c", "user.email=test@example.com"];
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: fixtureEnv() }).trim();
function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
function commit(root, message, files) {
  for (const [path, text] of Object.entries(files)) write(root, path, text);
  git(root, "add", "--", ...Object.keys(files));
  git(root, ...IDENTITY, "commit", "-q", ...[message].flat().flatMap((paragraph) => ["-m", paragraph]));
  return git(root, "rev-parse", "HEAD");
}
function repo(path = realpathSync(tempDir("bb-release-envs-"))) {
  mkdirSync(path, { recursive: true });
  git(path, "init", "-q", "-b", "main");
  write(path, ".gitignore", ".buildbeat/\n");
  commit(path, "fixture", { ".gitignore": ".buildbeat/\n" });
  return path;
}
// The readback prints the environment it was given and fails for "broken".
const READBACK = 'echo "env=${BUILDBEAT_RELEASE_ENV:-unset}"; [ "${BUILDBEAT_RELEASE_ENV:-}" != broken ]';
const releaseOnly = (id) => [
  "repo: ../../..", `work: ${id}`, "release:", "  command: bash", "  args:", "    - -lc", `    - '${READBACK}'`, "",
].join("\n");
const call = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: fixtureEnv() });
function cli(cwd, ...args) {
  const out = call(cwd, ...args);
  assert.equal(out.status, 0, `${out.stderr}\n${out.stdout}`);
  return out.stdout;
}
const releases = (root, id) => readFileSync(join(root, "delivery", "work", id, "releases.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const statusRow = (root, id) => JSON.parse(cli(root, "status", "--repo", ".", "--work", id, "--json")).works[0];

// A work done in a session: work.md, a config that only records releases,
// and a code commit naming the work.
function sessionWork(root, id) {
  commit(root, `docs: ${id}`, { [`delivery/work/${id}/work.md`]: `# ${id}\n`, [`delivery/work/${id}/run-config.yaml`]: releaseOnly(id) });
  return commit(root, [`feat: ${id}`, `Work: ${id}`], { [`src/${id}.js`]: `${id}\n` });
}

test("a config with release: and no workers only records readbacks", () => {
  assert.deepEqual(checkRunConfigShape({ repo: "../../..", work: "W", release: { command: "true" } }), []);
  assert.deepEqual(checkRunConfigShape({ repo: "../../..", work: "W" }), [
    "run: required and missing",
    "workers: required and missing (at least the verifier; see templates/v2/run-config.example.yaml)",
  ]);

  const root = repo();
  sessionWork(root, "WORK-A");
  const config = "delivery/work/WORK-A/run-config.yaml";
  assert.match(cli(root, "check", "--config", config), /^release readback: bash -lc /m);
  const refused = call(root, "run", "--config", config);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /^error: delivery\/work\/WORK-A\/run-config\.yaml has no workers: it only records releases \(buildbeat release\); add workers to run it$/m);
});

test("release --env records the environment and hands it to the readback command", () => {
  const root = repo();
  const code = sessionWork(root, "WORK-A");
  const config = "delivery/work/WORK-A/run-config.yaml";

  const prod = cli(root, "release", "--config", config, "--env", "prod", "--note", "server 2 of 3");
  assert.match(prod, new RegExp(`^readback passed \\(exit 0\\) for HEAD at ${code.slice(0, 7)} in prod, candidate ${code.slice(0, 7)} \\(no run: latest commit of WORK-A in HEAD\\) — server 2 of 3$`, "m"));
  assert.match(prod, /^ {2}\| env=prod$/m);
  const plain = cli(root, "release", "--config", config);
  assert.match(plain, /^readback passed \(exit 0\) for HEAD at [0-9a-f]{7}, candidate /m);
  assert.match(plain, /^ {2}\| env=unset$/m);

  const [first, second] = releases(root, "WORK-A");
  assert.equal(first.env, "prod");
  assert.equal(first.note, "server 2 of 3");
  assert.equal(first.run, null);
  assert.equal(first.candidate, code);
  assert.equal(first.status, "passed");
  assert.equal(Object.hasOwn(second, "env"), false);

  // Only --env sets the variable: not the config's env:, not the host.
  write(root, config, releaseOnly("WORK-A").replace("release:\n", "release:\n  env:\n    BUILDBEAT_RELEASE_ENV: prod\n"));
  assert.match(cli(root, "release", "--config", config), /^ {2}\| env=unset$/m);
  assert.match(cli(root, "release", "--config", config, "--env", "preprod"), /^ {2}\| env=preprod$/m);
  write(root, config, releaseOnly("WORK-A").replace("release:\n", "release:\n  inheritEnv: true\n"));
  const inherited = spawnSync(process.execPath, [CLI, "release", "--config", config], {
    cwd: root, encoding: "utf8", env: { ...fixtureEnv(), BUILDBEAT_RELEASE_ENV: "prod" },
  });
  assert.equal(inherited.status, 0, inherited.stderr);
  assert.match(inherited.stdout, /^ {2}\| env=unset$/m);
  assert.deepEqual(releases(root, "WORK-A").slice(2).map((row) => row.env ?? null), [null, "preprod", null]);
  write(root, config, releaseOnly("WORK-A"));

  const bad = call(root, "release", "--config", config, "--env", "pre prod");
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /--env pre prod: an environment name is letters, digits, "\.", "_" and "-", starting with a letter or digit/);
  assert.equal(releases(root, "WORK-A").length, 5);
});

test("a work with a succeeded run is still read back against its candidate", () => {
  const root = repo();
  commit(root, "docs: WORK-R", { "delivery/work/WORK-R/work.md": "# WORK-R\n" });
  const base = git(root, "rev-parse", "HEAD");
  const candidate = commit(root, "feat: r", { "src/r.js": "r\n" });
  write(root, "delivery/work/WORK-R/runs/RUN-R-01/run-record.json", JSON.stringify({
    startedAt: "2026-10-01T00:00:00Z", finishedAt: "2026-10-01T01:00:00Z", terminal: { status: "SUCCEEDED" }, workspaces: { "RUN-R-01": { base, candidate } },
  }));
  commit(root, "docs: WORK-R records", {
    "delivery/work/WORK-R/run-config.yaml": [
      "repo: ../../..", "work: WORK-R", "run: RUN-R", "workers:", "  verifier:", "    command: bash", "    args:", "      - -lc", '      - "true"',
      ...releaseOnly("WORK-R").split("\n").slice(2),
    ].join("\n"),
    "delivery/work/WORK-R/runs/RUN-R-01/run-record.json": readFileSync(join(root, "delivery/work/WORK-R/runs/RUN-R-01/run-record.json"), "utf8"),
  });
  const out = cli(root, "release", "--config", "delivery/work/WORK-R/run-config.yaml", "--env", "preprod");
  assert.match(out, new RegExp(`in preprod, candidate ${candidate.slice(0, 7)} \\(RUN-R-01\\)$`, "m"));
  const [row] = releases(root, "WORK-R");
  assert.equal(row.run, "RUN-R-01");
  assert.equal(row.candidate, candidate);
  assert.equal(row.env, "preprod");
});

test("a work without a run is bound to its newest code commit, can close on it, and is refused without one", () => {
  const root = repo();
  sessionWork(root, "WORK-A");
  const newest = commit(root, ["fix: a again", "Work: WORK-A"], { "src/WORK-A.js": "again\n" });
  commit(root, "docs: WORK-EMPTY", { "delivery/work/WORK-EMPTY/work.md": "# WORK-EMPTY\n", "delivery/work/WORK-EMPTY/run-config.yaml": releaseOnly("WORK-EMPTY") });

  const before = statusRow(root, "WORK-A");
  assert.equal(before.stage, "COMMITTED");
  assert.equal(before.next,
    "if it is done, release it (a human action), then buildbeat release --config delivery/work/WORK-A/run-config.yaml --env <name>; then close it out: buildbeat decide --repo . --work WORK-A --action close --draft, edit delivery/work/WORK-A/result.md, then buildbeat decide --repo . --work WORK-A --action close --by <you>");
  const closeEarly = call(root, "decide", "--repo", ".", "--work", "WORK-A", "--action", "close", "--by", "owner");
  assert.notEqual(closeEarly.status, 0);

  cli(root, "release", "--config", "delivery/work/WORK-A/run-config.yaml", "--env", "prod");
  assert.equal(releases(root, "WORK-A")[0].candidate, newest);
  const after = statusRow(root, "WORK-A");
  assert.equal(after.stage, "COMMITTED");
  assert.match(after.next, /^if it is done, close it out: buildbeat decide /);
  write(root, "delivery/work/WORK-A/result.md", "# WORK-A result\n\nShipped to prod.\n\n## Written into the project\n- none: nothing outlives it\n");
  cli(root, "decide", "--repo", ".", "--work", "WORK-A", "--action", "close", "--by", "owner");
  const closed = JSON.parse(readFileSync(join(root, "delivery/work/WORK-A/decisions.jsonl"), "utf8").trim().split("\n").at(-1));
  assert.equal(closed.subject.candidate, newest);

  const none = call(root, "release", "--config", "delivery/work/WORK-EMPTY/run-config.yaml", "--env", "prod");
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /^error: WORK-EMPTY has no succeeded run and no commits in HEAD trace to it; nothing to read back$/m);

  // A config with workers is meant to run: commits do not stand in for the run.
  write(root, "delivery/work/WORK-A/run-config.yaml", [
    "repo: ../../..", "work: WORK-A", "run: RUN-A", "workers:", "  verifier:", "    command: bash", "    args:", "      - -lc", '      - "true"',
    ...releaseOnly("WORK-A").split("\n").slice(2),
  ].join("\n"));
  const meant = call(root, "release", "--config", "delivery/work/WORK-A/run-config.yaml", "--env", "prod");
  assert.notEqual(meant.status, 0);
  assert.match(meant.stderr, /^error: WORK-A has no succeeded run; approve its merge decision first \(a work done without a run reads back through a config with release: and no workers:\)$/m);
});

test("status --releases lists the latest passing readback per environment, across works and repositories", () => {
  const root = repo();
  assert.equal(cli(root, "status", "--repo", ".", "--releases").trim(), "releases: none recorded (buildbeat release --config <run-config.yaml> --env <name>)");
  const a = sessionWork(root, "WORK-A");
  const b = sessionWork(root, "WORK-B");
  const cfg = (id) => `delivery/work/${id}/run-config.yaml`;
  cli(root, "release", "--config", cfg("WORK-A"), "--env", "prod", "--note", "server 1 of 2");
  cli(root, "release", "--config", cfg("WORK-B"), "--env", "preprod");
  cli(root, "release", "--config", cfg("WORK-B"), "--env", "prod", "--note", "server 2 of 2");
  cli(root, "release", "--config", cfg("WORK-A"));
  assert.notEqual(call(root, "release", "--config", cfg("WORK-A"), "--env", "broken").status, 0);
  // A failing readback in prod after the passing one is marked on prod's line.
  write(root, ".gitignore", ".buildbeat/\n");
  const failing = releaseOnly("WORK-B").replace(READBACK, "exit 4");
  write(root, cfg("WORK-B"), failing);
  assert.notEqual(call(root, "release", "--config", cfg("WORK-B"), "--env", "prod").status, 0);

  const text = cli(root, "status", "--repo", ".", "--releases").trimEnd().split("\n");
  assert.equal(text[0], "releases (latest passing readback per environment):");
  assert.match(text[1], /^ {2}broken {3}no passing readback · latest readback failed @ \S+ \(WORK-A, exit 1\)$/);
  assert.match(text[2], new RegExp(`^ {2}preprod {2}WORK-B {2}${b.slice(0, 7)} @ \\S+$`));
  assert.match(text[3], new RegExp(`^ {2}prod {5}WORK-B {2}${b.slice(0, 7)} @ \\S+ — server 2 of 2 · later readback failed @ \\S+ \\(WORK-B, exit 4\\)$`));
  // The commit is what the release ref held when it was read back.
  assert.match(text[4], new RegExp(`^ {2}- {8}WORK-A {2}${b.slice(0, 7)} @ \\S+ {3}\\(recorded without --env\\)$`));
  assert.equal(releases(root, "WORK-A")[0].candidate, a);
  assert.equal(text.length, 5);

  const json = JSON.parse(cli(root, "status", "--repo", ".", "--releases", "--json")).releases;
  assert.deepEqual(json.map((item) => item.env), ["broken", "preprod", "prod", null]);
  const prod = json[2];
  assert.equal(prod.work, "WORK-B");
  assert.equal(prod.commit, b);
  assert.equal(prod.candidate, b);
  assert.equal(prod.run, null);
  assert.equal(prod.note, "server 2 of 2");
  assert.equal(prod.repo, root);
  assert.equal(prod.laterFailure.work, "WORK-B");
  assert.equal(prod.laterFailure.exitCode, 4);
  assert.equal(json[0].work, null);

  // A code repository one level down is summarised with --all-repos.
  const code = repo(join(root, "api"));
  const api = sessionWork(code, "WORK-API");
  cli(code, "release", "--config", cfg("WORK-API"), "--env", "staging");
  assert.ok(!cli(root, "status", "--repo", ".", "--releases").includes("staging"));
  const all = JSON.parse(cli(root, "status", "--repo", ".", "--releases", "--all-repos", "--json")).releases;
  const staging = all.find((item) => item.env === "staging");
  assert.equal(staging.work, "WORK-API");
  assert.equal(staging.commit, api);
  assert.equal(staging.repo, code);

  const mixed = call(root, "status", "--repo", ".", "--releases", "--work", "WORK-A");
  assert.notEqual(mixed.status, 0);
  assert.match(mixed.stderr, /status: --releases cannot be combined with --work or --run/);
});

test("the operations template says where deployed versions come from", () => {
  const read = (name) => readFileSync(join(ROOT, "templates", "v2", name), "utf8");
  const page = read("operations.example.md");
  assert.match(page, /^# Operations\n\nHow to release, roll back and run this project, and the traps that have bitten before\. Rules and steps only: what is deployed right now comes from buildbeat status --releases, not from this page\.\n/);
  assert.deepEqual(page.match(/^## .+$/gm), ["## Environments", "## Release", "## Roll back", "## Traps"]);
  assert.match(read("result.example.md"), /^If the project has no place for an operating rule or a trap, write it into docs\/operations\.md \(template: templates\/v2\/operations\.example\.md\)\.$/m);
});
