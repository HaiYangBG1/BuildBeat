# BuildBeat file-bus check specification

Status: **Phase 2-B WP2.5 implementation baseline** · normative bus-check schema: `1` · Phase 0–2 are committed locally in `b062f25`, while the current source checkout and legacy `solobaton@1.16.3` package metadata remain unpushed/unpublished and make no v1.18/v1.19/v1.20 release claim. CLI output/manifest schema 2 and the WP3.1 mechanical-upgrade candidate are specified separately in [`CLI.md`](CLI.md); neither changes this bus-check schema.

This document is the single semantic source for `templates/scripts/bus-check.sh` and the same-directory scripts it orchestrates. It defines what a result means, not merely how output is colored. `SKILL.md`, board templates, fixtures, and script tests must use the same tokens and finding codes.

The Node CLI does not reimplement these synchronous file-bus checks. `doctor` keeps its existing inspection taxonomy; the relationship is documented in the appendix.

## 1. Authority and evidence boundary

The check layers are:

| Layer | Authority | Boundary |
|---|---|---|
| `bus-check.sh` | one synchronous report for file-bus, Gate, evidence, reference, stack, standards, and ADR findings | may aggregate sibling scripts, but must not invent facts they did not return |
| `verify-status.sh` | configured L3-suite state | an unconfigured suite is `unverified`, never green evidence; `--run` exits non-zero when any configured suite fails |
| `drift-check.sh` | configured production-fact comparison | missing adapters, failed queries, or truncated data are `unverified`, never “no drift” |
| `pre-commit.sh` | consumes `bus-check --strict` plus commit-local guards | a local hook is not server-side enforcement and can be absent on another clone |
| `doctor` | scaffold/install inspection | does not approve Gates or duplicate the bus result taxonomy |

The scripts may confirm only repository-visible facts and configured adapter results. They cannot prove that documentation matches arbitrary source code, that a human really approved a Gate, that a deployment is healthy, or that an unscanned path is clean. Those limits must appear as `unverified` findings or coverage reasons.

## 2. File-bus invariants

The eight invariant IDs are stable. New implementations extend the registry rather than renumbering it.

| ID | Normative rule | Machine-verifiable part | Must remain `unverified` without extra evidence | Implementation route |
|---|---|---|---|---|
| INV-1 | `pm/NOW.md` points to exactly one valid current board | NOW exists; one parseable current-period line and one board pointer; target is a live regular file under `pm/`, not `pm/archive/` | whether the named period is semantically the real current priority | current script partially checks existence/rot; Phase 1 adds stable codes |
| INV-2 | current board, status, and actual work state do not contradict one another | parseable work-package state; resolvable candidate hashes; configured L3 freshness; explicit contradictions between machine tokens | arbitrary prose status, uncommitted work, product truth, or live runtime state with no adapter | `bus-check` + `verify-status`; unresolved scope emits `sync.unverified` |
| INV-3 | a completed work package has evidence | every `✅完成` work-package block has one non-empty `**证据**:` line; local paths exist; hashes resolve | external URLs, screenshots not present locally, human statements, or commands whose output was not persisted | Phase 1 `evidence.missing`; external-only evidence also emits `sync.unverified` |
| INV-4 | a cross-boundary change is reflected in the contract | configured provider-path hints, contract file existence/version token, and project adapters when present | a generic script cannot infer all API/schema/public-behavior changes from arbitrary code | pre-commit hint + contract section; absence of a hint is never proof of synchronization |
| INV-5 | a passed Gate is traceable | Gate token parses; referenced decision/evidence path or hash is syntactically valid and locally resolvable | whether the named person actually approved or the evidence is sufficient | Phase 1 `gate.pass_untraceable`; human confirmation remains authoritative |
| INV-6 | a Gate marked `n/a` has a reason | exact `n/a` token and a non-placeholder `理由:` value on the same line | whether the reason is substantively correct for the project | Phase 1 `gate.na_without_reason`; later project-type checks may warn |
| INV-7 | pointers and references resolve safely | scoped Markdown/local references stay inside the root; regular-file targets exist; Git hashes resolve in the meta repo or discovered subrepos | remote-link availability or semantic correctness of an anchor | Phase 1 `ref.broken`; network is not used |
| INV-8 | an incomplete check is exposed | scan truncation, skipped directories, missing tools/adapters, permission errors, and failed child checks set incomplete coverage | anything outside the observed scope | `sync.unverified` or a narrower `*.unverified` code; never a confirmed all-clear |

INV-2 and INV-4 are intentionally not reducible to a single green boolean. When only part of an invariant is observable, report the confirmed subfact and the remaining `unverified` scope separately.

## 3. Machine-readable tokens

### 3.1 Gate state lines

The board contains one list item for each fixed Gate. The canonical form is:

```md
- Gate1: pending
- Gate2: n/a | 理由: `本期无 UI 或交互面`
- Gate3: passed | 决策: `pm/decisions.md` | 证据: `pm/archive/一期/evidence/gate3.md`
- Gate4: blocked | 理由: `尚无获批发布窗口`
```

Parser rules:

1. Accept optional leading whitespace, then the exact list marker `- `, `Gate1` through `Gate4`, one colon, and one lowercase state: `pending`, `passed`, `blocked`, or `n/a`.
2. Each Gate appears exactly once. Missing lines in a legacy board produce `gate.line_missing` at `warning`; duplicates or an unknown state are protocol `error` findings.
3. `n/a` requires a same-line `理由:` field whose backticked value is non-empty and contains no canonical `<...>` placeholder. Otherwise emit `gate.na_without_reason` at `conflict`.
4. `passed` should provide at least one `决策:` or `证据:` field. If neither is present or the reference cannot be traced, emit `gate.pass_untraceable` at `warning`.
5. `blocked` should carry `理由:`. Phase 1 may warn when it is absent, but this is not a strict blocker until a stable finding code is added here.
6. Natural-language Gate tables may remain for readers, but only these four canonical lines drive machine conclusions.

### 3.2 Work-package evidence lines

Within each `### WP-...` block, the canonical state and evidence fields are:

```md
- **状态**: ✅完成
- **证据**: `pm/archive/一期/evidence/report.md` · candidate `deadbee1`
```

The parser scopes a block from its `### WP-...` heading to the next heading of the same or higher level. A block containing `**状态**:` and `✅完成` must contain exactly one non-empty `**证据**:` line. Missing, duplicate, placeholder-only, or locally invalid evidence emits `evidence.missing` at `conflict`.

Machine-verifiable reference forms are:

- a backticked repository-relative regular-file path, optionally followed by `:<positive-line-number>`;
- a backticked 7–40 character lowercase hexadecimal Git token containing at least one letter and one digit, resolvable in the meta repo or a discovered subrepo;
- an `https://` reference, which is recorded but remains `unverified` unless a project adapter supplies a verified result.

Paths must not be absolute, contain traversal segments, or resolve through a symlink outside the coordination root. A command name or prose claim by itself is not machine-verifiable evidence; retain it for humans and emit `sync.unverified` when no local evidence token exists.

### 3.3 Scoped reference scan

Phase 1 checks Markdown links and backticked `.md` paths in `pm/NOW.md`, the current board, and the latest three dated rows of `pm/decisions.md`. It also checks paths/hashes on canonical Gate and evidence lines. The three-row decision window keeps the live synchronization guard from retroactively blocking on historical paths that were intentionally archived; the full repository linker remains a separate source-checkout gate in `tests/check_docs.py`.

Canonical Gate/evidence paths are repository-root relative. For scoped legacy prose, the scanner accepts an existing source-file-relative path first, then an existing repository-root path (and bare contract filenames under `contracts/`). Absolute paths, traversal segments, paths that resolve outside the root, wildcards/placeholders, overlong table fragments, and prose-only tokens are never treated as valid local evidence. Wildcards/placeholders/prose are ignored rather than mislabeled as broken regular-file references; a real path-shaped token that stays in scope but does not resolve emits `ref.broken`.

### 3.4 Optional standards

`standards/STACK.md`, `CODE.md`, `REVIEW.md`, and UI-only `DESIGN.md` are independent, project-owned optional files. If none exists, `bus-check` emits no standards finding. Every file that does exist must contain exactly once:

```md
> **Optional**: ...
> **AI write boundary**: ...
> **Status**: Draft
```

Status is exactly `Draft` or `Confirmed`. A Draft is structurally valid but emits `standards.unconfirmed` at `unverified`; it never becomes green by implication. A Confirmed file must contain no `<...>` placeholder.

Each present file contains at least one stable, unique Rule ID whose prefix matches the filename, for example `STACK-MUST-001`, `CODE-SHOULD-002`, or `DESIGN-MAY-003`. Levels are `MUST / SHOULD / MAY`; the numeric suffix is exactly three digits. Missing metadata, illegal/duplicate/wrong-prefix Rule IDs, a placeholder in a Confirmed file, or a broken repository-local backticked reference emits one `standards.invalid` error for that file. Remote references are not fetched. This structural check never infers machine values from the standards prose; a structurally valid Confirmed STACK enters the separate observation check below.

### 3.5 Confirmed STACK observable baseline

Only a structurally valid `standards/STACK.md` with `Status: Confirmed` enters stack observation. Draft or structurally invalid files retain their existing standards finding and are not compared, so an unconfirmed declaration cannot manufacture a drift conclusion. Absence of STACK remains a legal zero-finding state.

The Confirmed file contains exactly one v1 comment block:

```md
<!-- buildbeat-stack-baseline:v1
nodeConstraint=22
nodeConstraint=>=22 <23
lockfileKind=package-lock.json
dockerFromImage=node:22-alpine
-->
```

The three keys are exact and each must occur at least once. Repeating a key declares a set. Values are trimmed, case-sensitive strings of at most 200 characters; exact duplicates collapse. A dimension with no applicable source uses one sole `n/a` value, never `n/a` plus another value. A missing/duplicated/malformed block, an unknown or missing key, or an ambiguous `n/a` set emits `stack.unverified`, not `standards.invalid`: the standards document is structurally readable, but its observable baseline is not. A canonical `<...>` placeholder in any Confirmed standard remains the earlier `standards.invalid` structural error, so the observation step is skipped.

The scanner recursively observes regular files below the coordination root, pruning `.git`, `.claude`, `.codex`, canonical `.buildbeat`, legacy `.solobaton`, dependency, coverage, build, and generated-output directories. New STACK files use `buildbeat-stack-baseline:v1`; the parser also accepts exactly one legacy `solobaton-stack-baseline:v1` block. The default bound is 200 relevant files/symlinks and can be lowered or raised with positive-integer `BUS_STACK_MAX`. It compares these exact sets:

| Dimension | Observed source | Normalization |
|---|---|---|
| Node constraints | every `.nvmrc`; every string `package.json` `engines.node` | one trimmed non-empty `.nvmrc` line; JSON value preserved after outer trim |
| lockfile kinds | `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb` | basename only; duplicate kinds collapse |
| Docker FROM images | `Dockerfile` and `Dockerfile.*` FROM instructions | optional `--platform=...` removed; image token preserved; stage aliases ignored |

Observed and declared non-empty sets must match exactly. A declared `n/a` plus an observed source, or two non-empty sets that differ, emits `stack.drift` at `conflict`. A declared non-`n/a` set with no observable source emits `stack.unverified` rather than drift. Invalid JSON, a non-string Node engine, an empty/multi-line `.nvmrc`, an unreadable file, an unresolved variable in a Docker image token, missing Python needed for JSON parsing, an over-limit scan, a find/permission error, a relevant file symlink, or an unpruned directory symlink also leaves the affected scope `stack.unverified`. A definite mismatch and an incomplete remaining scope may emit both codes.

The check is report-only: it never edits STACK, version files, package manifests, lockfiles, or Dockerfiles. Findings name dimensions but do not echo raw source/config values into JSON. Matching only confirms these three observed dimensions inside the scanned regular-file scope; it says nothing about frameworks, databases, deployment health, CI, licensing, remote repositories not present below the root, or semantic compatibility.

### 3.6 Optional ADRs

ADR files are named `pm/adr/ADR-NNNN-*.md`. The directory and all ADR files are optional; absence emits no ADR finding. Every present ADR contains exactly one canonical status line:

```md
- Status: Proposed
```

The only legal values are `Proposed`, `Accepted`, `Rejected`, and `Superseded`. Missing, duplicated, or unknown status emits `adr.status_invalid` at `error`.

A Superseded ADR must contain exactly one root-relative target such as:

```md
- Superseded by: `pm/adr/ADR-0002-new-choice.md`
```

The target must exist, must itself have a legal status, and the chain must terminate without self-reference or cycles. Otherwise emit `adr.superseded_broken` at `conflict`. The script checks link integrity only; it cannot prove the architectural decision is correct or genuinely approved.

## 4. Result levels

Every finding has exactly one level:

| Level | Meaning | Strict by default |
|---|---|---|
| `confirmed` | a positive or neutral fact was directly observed | no |
| `warning` | a risk or traceability weakness exists, but no invariant conflict is established | no |
| `unverified` | the tool cannot reliably decide within the observed scope | no; must stay visible |
| `conflict` | a project declaration contradicts an observed fact or omits support required by an invariant | yes |
| `error` | protocol structure is malformed or the requested check cannot produce a trustworthy report | yes |

Levels are not a cosmetic mapping from legacy emoji or from `error/warning/info`. The implementation must construct the semantic finding first, then render human or JSON output from that same finding.

`confirmed` never means “the whole project is healthy.” If `coverage.complete` is false, the report cannot print or encode an unqualified all-clear.

## 5. Finding-code registry

Namespaces are reserved as follows:

| Namespace | Scope |
|---|---|
| `sync.` | NOW/status/L3/scan/remote and general coordination state |
| `gate.` | four-Gate tokens and traceability |
| `evidence.` | work-package evidence requirements |
| `contract.` | cross-boundary contract synchronization |
| `ref.` | local path, Markdown, and Git reference integrity |
| `stack.` | optional `STACK.md` observation and drift |
| `standards.` | optional standards structure/rules |
| `adr.` | optional ADR structure and supersession links |

The initial registry is:

| Code | Level | Condition | Phase |
|---|---|---|---|
| `sync.now_bloated` | `conflict` | NOW/status live coordination layer exceeds the configured rot limits | legacy behavior; code in Phase 1 |
| `sync.ghost_hash` | `conflict` | a canonical status hash cannot resolve in any known repo | legacy behavior; code in Phase 1 |
| `sync.production_drift` | `conflict` | configured drift adapter confirms a changed production fact | legacy behavior; code in Phase 1 |
| `sync.l3_stale` | `warning` | configured suite evidence is absent, unreadable, or older than `BUS_L3_MAX_AGE_DAYS` (default `7`) | Phase 1 |
| `sync.l3_unconfigured` | `unverified` | no real L3 suite is configured | Phase 1 |
| `sync.scan_truncated` | `unverified` | size, depth, permission, or symlink boundary leaves relevant scope unchecked | Phase 1 fixture; full advice in Phase 3 |
| `sync.unverified` | `unverified` | a material check boundary has no narrower registered code | Phase 1 |
| `gate.line_missing` | `warning` | a legacy board lacks one or more canonical Gate lines | Phase 1 |
| `gate.invalid` | `error` | a Gate state line is duplicated, malformed, or uses an unknown state | Phase 1 |
| `gate.na_without_reason` | `conflict` | `n/a` lacks a valid same-line reason | Phase 1 |
| `gate.pass_untraceable` | `warning` | `passed` lacks a resolvable decision/evidence reference | Phase 1 |
| `evidence.missing` | `conflict` | a completed work package lacks one valid canonical evidence line | Phase 1 |
| `ref.broken` | `conflict` | a scoped local path/hash reference is syntactically unsafe or does not resolve | Phase 1 |
| `standards.invalid` | `error` | a present optional standard has invalid metadata, Rule IDs, confirmed placeholders, or local references | Phase 2-A |
| `standards.unconfirmed` | `unverified` | a present optional standard is structurally valid but remains Draft | Phase 2-A |
| `stack.drift` | `conflict` | a Confirmed v1 STACK baseline contradicts an observed Node, lockfile, or Docker FROM set | Phase 2-B / WP2.5 |
| `stack.unverified` | `unverified` | a Confirmed STACK baseline or relevant observation scope cannot be compared reliably | Phase 2-B / WP2.5 |
| `adr.status_invalid` | `error` | a present ADR lacks exactly one legal canonical Status | Phase 2-A |
| `adr.superseded_broken` | `conflict` | a Superseded ADR points to a missing/invalid ADR or creates a self-reference/cycle | Phase 2-A |

New codes require this document, positive/negative fixtures, human rendering, JSON rendering, and strict behavior to change together. A code must not silently change level between releases; that is a user-visible compatibility change.

## 6. JSON report schema

`bus-check --format=json` emits one JSON document to stdout and no human dashboard text. Diagnostics that prevent a report go to stderr.

```json
{
  "schemaVersion": 1,
  "command": "bus-check",
  "ok": false,
  "target": ".",
  "findings": [
    {
      "code": "gate.na_without_reason",
      "level": "conflict",
      "message": "Gate2 is n/a without a non-placeholder reason.",
      "path": "pm/一期-看板.md"
    }
  ],
  "summary": {
    "confirmed": 0,
    "warning": 0,
    "unverified": 0,
    "conflict": 1,
    "error": 0
  },
  "coverage": {
    "complete": true,
    "reasons": []
  },
  "strict": {
    "enabled": true,
    "blocked": true
  }
}
```

Schema rules:

1. `target` and `path` are normalized repository-relative display paths; fixture output must not contain temporary absolute paths.
2. Findings are ordered by the registry/check order, then path, so repeated runs on unchanged facts are byte-stable apart from messages whose documented fact changed.
3. `ok` is true only when there is no `conflict` or `error`. Warnings and explicit unverified coverage do not change `ok`, but remain in the report.
4. `coverage.complete` is false when any relevant scope was truncated, skipped, unavailable, or failed. `reasons` contains stable finding codes, not secrets or raw command output.
5. Counts equal the findings array exactly. Unknown levels/codes are schema errors in fixtures and consumers.
6. JSON never includes credential values, environment values, arbitrary source contents, private messages, or live configuration values.

Exit behavior:

| Invocation | Exit 0 | Exit 1 | Exit 2 |
|---|---|---|---|
| default human or `--format=json` | a report was produced, even with findings | not used for findings | invalid arguments or failure to produce a trustworthy report |
| `--strict` with either format | no `conflict`/`error` | at least one `conflict`/`error` | invalid arguments or failure to produce a trustworthy report |

`warning` and `unverified` never block strict by implication. Promoting either level into the strict set requires an explicit code-level change in this specification and the changelog.

## 7. Current versus planned implementation

The current worktree candidate implements Phase 1, the Phase 2-A structural checks, and WP2.5 STACK observation from one finding collection: human rendering, schema 1 JSON, strict blocking, canonical Gate/evidence parsing, scoped reference scanning, L3 machine findings, explicit incomplete coverage, the three legacy strict checks, optional standards metadata/Rule-ID validation, exact Node/lockfile/Docker baseline comparison, and ADR status/supersession integrity. Default human and JSON report modes still return exit 0 after producing a trustworthy report; `--strict` returns exit 1 only for `conflict` or `error`.

Fixtures now execute both renderings. They compare finding codes, registered levels, counts, relative paths, coverage reasons, and strict status; retained human text assertions protect operator-facing compatibility. Matching, definite-conflict, and missing-observation STACK fixtures lock the WP2.5 result boundary. WP1.6 has also completed the example, active multi-repo projection, and real single-repo code-tree projection documented in [`PHASE1-PILOT-2026-08-24.md`](PHASE1-PILOT-2026-08-24.md). This closes the source/test/read-only-pilot candidate only: without separate release authorization and installed-project migration evidence, it remains an Unreleased candidate rather than v1.18 or installed-project behavior.

WP2.5 does not extend beyond its three explicit regular-file dimensions. Phase 3 remains responsible for deeper multi-repository drift, semantic Gate-to-decision line matching, and fuller permission/symlink boundary reporting. A green STACK comparison cannot be extrapolated into those scopes.

## 8. Three retained compatibility files

These files stay for distinct consumers and do not create a second semantic authority:

| File | Purpose | Schema 2 ownership |
|---|---|---|
| `CLAUDE.md` | thin compatibility pointer to `AGENTS.md` | `replace-if-unmodified` |
| `指挥台.md` | one-page human operator card | `replace-if-unmodified` |
| `.claude/agents/reviewer.md` | tool-specific read-only reviewer increment | `replace-if-unmodified` |

Project facts remain in AGENTS/NOW/board/contracts/status/evidence. These three files may point to those facts but must not copy them into competing SSOTs.

## Appendix: doctor comparison

`doctor` keeps `error / warning / info` and `ok = no error`; it does not migrate to the five bus levels in Phase 1.

| Doctor level | Closest display concept | Caveat |
|---|---|---|
| `error` | `error` | only within scaffold/install inspection |
| `warning` | `warning` | may include incomplete setup such as pending placeholders |
| `info` | `confirmed` when it reports an observed fact | not every info message is a project-wide confirmation |

No automated Gate or release decision may be made by mechanically converting doctor levels into bus-check levels.
