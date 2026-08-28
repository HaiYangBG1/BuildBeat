// observe v0 behavior per docs/v2/RFC-0003-workflow-policy.md §8 (frozen):
// providers emit contract-shaped evidence (unreachable = unverified, never
// silence), bands route log/diagnose/intent, intent drafts only enqueue, and
// dismiss feeds back into drafting. Runtime stays deletable (invariant 23).

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadObserveConfig, ObserveConfigError } from "../src/v2/observe/observe-config.js";
import {
  observeStatus,
  openObserveLedger,
  readIntentDrafts,
  runObserveCycle,
  triageIntent,
} from "../src/v2/observe/observe.js";

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-obs-"));
  mkdirSync(join(root, ".buildbeat"), { recursive: true });
  return root;
}

function writeConfig(root, { probeExit = 0, withDiagnose = true, failedSeverity = "error" } = {}) {
  writeFileSync(
    join(root, "probe.sh"),
    `#!/bin/sh\necho probe-output\nexit ${probeExit}\n`,
  );
  writeFileSync(join(root, "diagnose.sh"), "#!/bin/sh\necho diagnosis-output\nexit 0\n");
  const diagnoseBlock = withDiagnose
    ? `    diagnose:
      command: sh
      args:
        - diagnose.sh
`
    : "";
  const configPath = join(root, ".buildbeat", "observe.yaml");
  writeFileSync(
    configPath,
    `kind: workflow
version: 1
name: observe
providers:
  - id: drift-check
    command: sh
    args:
      - probe.sh
    evidence:
      kind: drift
      subject: unit-a
    severity:
      failed: ${failedSeverity}
      unverified: warn
${diagnoseBlock}bands:
  - level: log
    when: "severity >= info"
  - level: diagnose
    when: "severity >= error"
  - level: intent
    when: "severity >= error"
triage:
  actions:
    - fix_now
    - schedule
    - dismiss
  dismissFeedback: bands
`,
  );
  return configPath;
}

test("observe config is fail-closed on shape violations", () => {
  const root = makeRepo();
  const cases = [
    ["kind: pipeline", "kind must be workflow"],
    ["name: watch", "name must be observe"],
    ["version: 2", "unsupported observe config version"],
  ];
  for (const [override, message] of cases) {
    const [key] = override.split(":");
    const base = readFileSync(writeConfig(root), "utf8");
    const mutated = base.replace(new RegExp(`^${key}: .*$`, "m"), override);
    const path = join(root, ".buildbeat", `observe-${key}.yaml`);
    writeFileSync(path, mutated);
    assert.throws(() => loadObserveConfig(path), ObserveConfigError, message);
  }
  // bands must be exactly the three fixed levels in order
  const base = readFileSync(writeConfig(root), "utf8");
  const noIntent = base.replace(/  - level: intent\n    when: "severity >= error"\n/, "");
  const bandsPath = join(root, ".buildbeat", "observe-bands.yaml");
  writeFileSync(bandsPath, noIntent);
  assert.throws(() => loadObserveConfig(bandsPath), /exactly the three levels/);
  // when expressions outside the subset are rejected
  const badWhen = base.replace('when: "severity >= info"', 'when: "always"');
  const whenPath = join(root, ".buildbeat", "observe-when.yaml");
  writeFileSync(whenPath, badWhen);
  assert.throws(() => loadObserveConfig(whenPath), /must match "severity >= <level>"/);
  // triage action set is closed
  const badTriage = base.replace("    - dismiss\n", "");
  const triagePath = join(root, ".buildbeat", "observe-triage.yaml");
  writeFileSync(triagePath, badTriage);
  assert.throws(() => loadObserveConfig(triagePath), /closed set/);
});

test("passing provider records evidence and triggers no bands", () => {
  const root = makeRepo();
  const configPath = writeConfig(root, { probeExit: 0 });
  const result = runObserveCycle({ configPath });
  assert.equal(result.results[0].status, "passed");
  assert.equal(result.results[0].severity, null);
  assert.deepEqual(result.results[0].bands, []);
  assert.equal(result.results[0].intent, null);
  const state = openObserveLedger(root).state;
  assert.equal(state.cycles, 1);
  assert.equal(state.evidence.length, 1);
  assert.equal(state.evidence[0].status, "passed");
  assert.equal(state.bands.length, 0);
  assert.equal(readIntentDrafts(root).length, 0);
});

test("failing provider walks log/diagnose/intent and only enqueues a draft", () => {
  const root = makeRepo();
  const configPath = writeConfig(root, { probeExit: 3 });
  const result = runObserveCycle({ configPath });
  assert.equal(result.results[0].status, "failed");
  assert.equal(result.results[0].severity, "error");
  assert.deepEqual(result.results[0].bands, ["log", "diagnose", "intent"]);
  assert.equal(result.results[0].intent.outcome, "drafted");
  const state = openObserveLedger(root).state;
  // provider evidence + diagnosis evidence, both in the same ledger
  assert.equal(state.evidence.length, 2);
  assert.equal(state.evidence[1].kind, "diagnosis");
  assert.equal(state.evidence[1].status, "passed");
  assert.equal(Object.keys(state.intents).length, 1);
  const drafts = readIntentDrafts(root);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].header.status, "draft");
  assert.equal(drafts[0].header.severity, "error");
  // enqueue only: no delivery run was ever created
  assert.equal(existsSync(join(root, ".buildbeat", "runtime", "runs")), false);
});

test("unreachable probe is unverified (warn): logged, no diagnose, no intent", () => {
  const root = makeRepo();
  const configPath = writeConfig(root);
  const broken = readFileSync(configPath, "utf8").replace("command: sh", "command: no-such-binary-bb");
  writeFileSync(configPath, broken);
  const result = runObserveCycle({ configPath });
  assert.equal(result.results[0].status, "unverified");
  assert.equal(result.results[0].severity, "warn");
  assert.deepEqual(result.results[0].bands, ["log"]);
  assert.equal(result.results[0].intent, null);
});

test("open draft deduplicates; dismiss suppresses; escalation reopens", () => {
  const root = makeRepo();
  const configPath = writeConfig(root, { probeExit: 3 });
  const first = runObserveCycle({ configPath });
  const intentRef = first.results[0].intent.intentRef;
  // second cycle, same failure: no second draft
  const second = runObserveCycle({ configPath });
  assert.equal(second.results[0].intent.outcome, "already-queued");
  assert.equal(readIntentDrafts(root).length, 1);
  // dismiss feeds back: same fingerprint stops re-queueing
  const triaged = triageIntent({ repoRoot: root, intentRef, action: "dismiss", by: "haiyang" });
  assert.equal(triaged.status, "dismissed");
  const third = runObserveCycle({ configPath });
  assert.equal(third.results[0].intent.outcome, "suppressed");
  assert.equal(readIntentDrafts(root)[0].header.status, "dismissed");
  // severity escalation overrides the dismissal
  writeConfig(root, { probeExit: 3, failedSeverity: "critical" });
  const fourth = runObserveCycle({ configPath });
  assert.equal(fourth.results[0].intent.outcome, "reopened");
  const reopened = readIntentDrafts(root)[0].header;
  assert.equal(reopened.status, "draft");
  assert.equal(reopened.severity, "critical");
  // ledger recorded band triggers for every cycle and the human triage
  const state = openObserveLedger(root).state;
  assert.equal(state.triage.length, 1);
  assert.equal(state.triage[0].action, "dismiss");
});

test("fix_now accepts the draft and only suggests a run, never starts one", () => {
  const root = makeRepo();
  const configPath = writeConfig(root, { probeExit: 3 });
  const result = runObserveCycle({ configPath });
  const triaged = triageIntent({
    repoRoot: root,
    intentRef: result.results[0].intent.intentRef,
    action: "fix_now",
    by: "haiyang",
  });
  assert.equal(triaged.status, "accepted");
  assert.match(triaged.suggestion, /never executes itself/);
  assert.equal(existsSync(join(root, ".buildbeat", "runtime", "runs")), false);
  // an accepted draft stays queued, not re-drafted
  const next = runObserveCycle({ configPath });
  assert.equal(next.results[0].intent.outcome, "already-queued");
});

test("deleting runtime loses no triage memory (invariant 23)", () => {
  const root = makeRepo();
  const configPath = writeConfig(root, { probeExit: 3 });
  const first = runObserveCycle({ configPath });
  triageIntent({
    repoRoot: root,
    intentRef: first.results[0].intent.intentRef,
    action: "dismiss",
    by: "haiyang",
  });
  rmSync(join(root, ".buildbeat", "runtime"), { recursive: true, force: true });
  // fresh runtime, same Git-plane drafts: dismissal still suppresses
  const after = runObserveCycle({ configPath });
  assert.equal(after.cycle, 1);
  assert.equal(after.results[0].intent.outcome, "suppressed");
  const status = observeStatus({ repoRoot: root });
  assert.equal(status.intents[0].status, "dismissed");
});

test("observe ledger keeps the same chain discipline across reopen", () => {
  const root = makeRepo();
  const configPath = writeConfig(root, { probeExit: 3 });
  runObserveCycle({ configPath });
  runObserveCycle({ configPath });
  const ledger = openObserveLedger(root);
  assert.equal(ledger.corruption, null);
  assert.equal(ledger.state.cycles, 2);
  // tamper with one line: reopen truncates and refuses appends
  const lines = readFileSync(ledger.path, "utf8").trim().split("\n");
  const tampered = lines.map((line, index) => (index === 0 ? line.replace(/"cycle":1/, '"cycle":9') : line));
  writeFileSync(ledger.path, `${tampered.join("\n")}\n`);
  const reopened = openObserveLedger(root);
  assert.ok(reopened.corruption);
  assert.throws(() => runObserveCycle({ configPath }), /corrupted/);
});
