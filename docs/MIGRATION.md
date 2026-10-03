# Product simplification migration / 减法迁移

Status: 4.0.0-dev.0 is an unpublished local candidate. No registry publication,
installed-tool upgrade, target-project migration or production change is implied.

## Existing work / 存量工作

- Keep candidate branches, raw logs, decisions, findings and run-record.json.
  The CLI does not delete or rewrite them during migration. Old event schemas
  remain readable; historical release records still display RELEASED.
- Finish existing 3.x active runs with their original 3.3.1 runtime: those
  ledgers do not contain frozen deliveryChecks, so this major refuses to resume
  or approve them. They remain readable and cancellable. Official legacy
  software-delivery configurations can start NEW attempts on this version;
  their exact workflow digest and original safeguards are retained. Never edit
  the workflow or switch bound artifacts during a run. Legacy intent/plan/spec
  records remain readable.
- fast/standard/controlled are compatibility inputs, mapped to the same required
  artifacts and severity floor. controlled cannot silently fall back to standard.
- Custom workflow graphs, policy files and release/observe execution are retired.
  Their configurations fail before starting workers. Finish/cancel active work
  using its existing 3.3.1 runtime; preserve the records and configure project
  verification/CI scripts explicitly before creating new delivery work.
- Never run 3.3.1 against a new 4.x run: it does not enforce the new frozen-check
  fields. Roll back the tool only after new runs are stopped and their state is
  retained. Use separate installation prefixes when comparing versions.
- 旧项目文件不自动删除、不自动改写。先核对活动运行和外部使用，再迁移。
  自定义/生产流程要先完成或停止旧运行、保留证据，随后显式迁入项目工具。

## New work / 新工作

Write delivery/work/<ID>/work.md with goal, scope, acceptance and implementation
plan; accept that one file. Omit workflow, riskPreset and policies in new run
configurations. The fixed build/verify/review/fix graph and acceptance/evidence
checks are built in. Optional maxReviewSeverity: P3 tightens review; stopAt and
reviewTriage: required add explicit human boundaries when actually needed.

Creation freezes deliveryChecks in the event ledger. Resume cannot weaken them;
approval derives them from the ledger even without --config. Changing work.md
invalidates its acceptance and cannot authorize an old candidate implicitly.
Legacy projects may keep their old files; do not add work.md in the middle of an
active legacy run because that changes the bound artifact.

## Command consolidation / 命令合并

| Old entry | Current entry |
|---|---|
| start / resume / resume --adopt | run; --new explicitly starts another attempt |
| overview / inbox / status / metrics | status, optionally --work / --run / --json |
| approve / reject / findings adjudicate | decide --action ... with the exact subject |
| doctor / preflight | check; explicit --step still executes in the main checkout |
| events / replay | history / history --verify |

Old core spellings remain aliases over shared handlers. accept, stop and gc stay
explicit. watch is internal feedback plumbing. The old observe command returns a
migration error; it never runs a probe or changes old records.

## Removed scope / 移出范围

Production monitoring, diagnosis/intent queues and release readback move to
project-owned monitoring, scripts and CI. BuildBeat stops at the merge decision.
UI screenshots and visual checks belong in project verification and reviewer
instructions. Governance examples are archived under docs/history/retired-templates
and are not shipped in the package. The Skill has one runtime-backed route;
human-readable files and manual takeover remain available without a second
"equivalent manual runtime" product promise.

## Validation / 验证

Compare candidate/evidence/decision outcomes, worker attempts and human stops in
the deterministic first-run, repair, resume and stale-approval scenarios. Run the
package-installed first-run test, not only source tests. A change in test-suite
wall time or package size does not establish real-model delivery speed.
