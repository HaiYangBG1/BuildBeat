import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { DecisionError, adoptCandidate } from "../src/v2/runtime/decisions.js";
import { resumeRun, startRun } from "../src/v2/runtime/orchestrator.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat-v2.js");
const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-adopt-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return root;
}

const committingBuilder = () =>
  createShellAdapter({
    name: "shell:builder",
    command: "bash",
    args: ["-lc", "echo done > feature.txt && git add -A && git commit -qm candidate"],
  });
const clean = () => ({ behavior: "succeed", envelope: { status: "succeeded", findings: [] } });

function handFix(worktree, name = "fixed.txt") {
  writeFileSync(join(worktree, name), "fixed by hand\n");
  git(worktree, ["add", "-A"]);
  git(worktree, ["commit", "-qm", "hand fix"]);
  return git(worktree, ["rev-parse", "HEAD"]);
}

test("adopting a hand-committed fix answers the pending request and resumes at verify, skipping the fixer", () => {
  // Real incident: hand fixes inside a run cost a no-op fixer and an extra
  // verify each time (a frontend run reached verify #5 and fix #3 for three
  // hand fixes).
  const root = fixtureRepo();
  const mock = createMockAdapter({ verify: ["fail", "succeed"], review: [clean()] });
  const base = {
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: "sha256:wf",
    workId: "WORK-AD",
    runId: "RUN-AD",
    entry: "build",
    stopAt: ["fix"],
    adapters: { builder: committingBuilder(), verifier: mock, reviewer: mock, fixer: mock },
  };
  const started = startRun(base);
  assert.equal(started.state.pendingHuman.transition, "enter-fix");
  const worktree = join(root, ".buildbeat", "worktrees", "RUN-AD");
  const sha = handFix(worktree);

  const adopted = adoptCandidate(root, "RUN-AD", { sha: sha.slice(0, 7), by: "owner", resumeAt: "verify" });
  assert.equal(adopted.adopted, sha);
  assert.equal(adopted.transition, "enter-fix");

  const resumed = resumeRun(base);
  const state = resumed.state;
  assert.equal(state.steps.fix, undefined, "fixer never ran");
  assert.equal(state.steps.verify.attempts, 2);
  assert.equal(state.steps.verify.status, "SUCCEEDED");
  assert.equal(state.workspaces["RUN-AD"].candidate, sha);
  assert.equal(state.pendingHuman.kind, "final-decision");
  assert.equal(state.pendingHuman.subject.candidate, sha);

  const ledger = EventLedger.open(join(root, ".buildbeat", "runtime", "runs", "RUN-AD", "events.jsonl"));
  const pinned = ledger.events.find((event) => event.type === "CANDIDATE_PINNED" && event.data.adopted === true);
  assert.equal(pinned.actor.kind, "human");
  assert.equal(pinned.actor.id, "owner");
  const line = readFileSync(join(root, "delivery", "work", "WORK-AD", "decisions.jsonl"), "utf8").trim().split("\n").pop();
  assert.equal(JSON.parse(line).adopted, sha);
  assert.equal(JSON.parse(line).resumeAt, "verify");
});

test("adopt reads git back: a dirty tree or a sha that is not HEAD is refused", () => {
  const root = fixtureRepo();
  const mock = createMockAdapter({ verify: ["fail"] });
  const base = {
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: "sha256:wf",
    workId: "WORK-AD2",
    runId: "RUN-AD2",
    entry: "build",
    stopAt: ["fix"],
    adapters: { builder: committingBuilder(), verifier: mock, fixer: mock },
  };
  startRun(base);
  const worktree = join(root, ".buildbeat", "worktrees", "RUN-AD2");
  const head = git(worktree, ["rev-parse", "HEAD"]);
  assert.throws(
    () => adoptCandidate(root, "RUN-AD2", { sha: "0000000", by: "owner", resumeAt: "verify" }),
    (error) => error instanceof DecisionError && /not 0000000/.test(error.message),
  );
  writeFileSync(join(worktree, "wip.txt"), "uncommitted\n");
  assert.throws(
    () => adoptCandidate(root, "RUN-AD2", { sha: head, by: "owner", resumeAt: "verify" }),
    /worktree is dirty/,
  );
});

test("resume --adopt through the CLI", () => {
  const root = fixtureRepo();
  writeFileSync(
    join(root, "run-config.yaml"),
    [
      "repo: .",
      "work: WORK-ADC",
      "run: RUN-ADC",
      `workflow: ${PRESET_PATH}`,
      "riskPreset: fast",
      "entry: build",
      "stopAt:",
      "  - fix",
      "workers:",
      "  builder:",
      "    command: bash",
      "    args:",
      "      - -lc",
      "      - 'echo done > feature.txt && git add -A && git commit -qm candidate'",
      "  verifier:",
      "    command: bash",
      "    args:",
      "      - -lc",
      "      - test -f fixed.txt",
      "  fixer:",
      "    command: bash",
      "    args:",
      "      - -lc",
      "      - 'exit 1'",
    ].join("\n"),
  );
  const cli = (args) => execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  const started = cli(["start", "--config", join(root, "run-config.yaml")]);
  assert.match(started, /waiting on human: enter-fix/);
  const sha = handFix(join(root, ".buildbeat", "worktrees", "RUN-ADC"));
  const resumed = cli(["resume", "--config", join(root, "run-config.yaml"), "--adopt", sha, "--by", "owner"]);
  assert.match(resumed, new RegExp(`adopted ${sha} as candidate .*resuming at verify`));
  assert.match(resumed, /waiting on human: enter-review/);
  assert.doesNotMatch(resumed, /step fix/);
});
