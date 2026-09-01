# BuildBeat CLI lifecycle contract

Status: **BuildBeat `1.21.0` independently verified scoped distribution** · canonical package `@haiyangbg/buildbeat` · canonical executable `buildbeat` · legacy package `solobaton@1.16.3` remains the independently verified read-only v0 · Node.js 20+ · zero third-party runtime dependencies. The 1.21 release keeps the verified 1.20 lifecycle command and safety boundaries, and adds the standard domain-response contract to the Skill and managed scaffold. The genuine lifecycle version-increment pilot remains archived in [`PHASE4-V1.20-PILOT-2026-08-25.md`](PHASE4-V1.20-PILOT-2026-08-25.md); exact 1.21 registry and supply-chain evidence is archived in [`V1.21-RELEASE-EVIDENCE-2026-08-25.md`](V1.21-RELEASE-EVIDENCE-2026-08-25.md).

The CLI does not replace `SKILL.md`. The Skill owns code-aware reasoning, minimal questions, project semantics, and human Gates. The CLI owns deterministic inspection, scaffold mechanics, manifest/hash bookkeeping, and bounded mechanical upgrade in the current scoped distribution. Synchronous file-bus checks remain authoritative in the project-local scripts specified by [`CHECKS.md`](CHECKS.md).

The bilingual [`CAPABILITY-MATRIX.md`](CAPABILITY-MATRIX.md) is the compact authority for what Skill-only, the legacy npm v0, and BuildBeat 1.21 can each do. Command details and safety semantics remain authoritative in this document.

## Command boundary and phased availability

The canonical scoped-package commands are:

```bash
npm view @haiyangbg/buildbeat@latest version
npx --yes --package=@haiyangbg/buildbeat@latest buildbeat doctor /path/to/project
npx --yes --package=@haiyangbg/buildbeat@latest buildbeat init /path/to/project --dry-run
npx --yes --package=@haiyangbg/buildbeat@latest buildbeat adopt /path/to/project --dry-run
npx --yes --package=@haiyangbg/buildbeat@latest buildbeat upgrade /path/to/project --dry-run
```

Record the version returned by `npm view` and substitute that exact version for `@latest` when the invocation must be reproducible. Before registry publication is independently verified, the same lifecycle can only be evaluated from a locked repository checkout via `node bin/buildbeat.js`; `node bin/solobaton.js` remains a compatibility alias. The old `solobaton@latest` package remains frozen on read-only v0 and is not the write-capable distribution.

- `doctor` reads an existing project and reports installation state, layout, version marker, required files, unresolved canonical placeholders, hooks, and capability dependencies.
- `init/adopt --dry-run` inspect a target and emit the complete default/compact plan with zero writes.
- `init/adopt` without `--dry-run` apply only after all blockers are absent and interactive confirmation or explicit `--yes` is present.
- `upgrade --dry-run` plans a schema-2-only mechanical version transition; apply is fail-closed on unresolved conflict.
- `--json` returns a versioned JSON document for agents and CI.
- `diff` and `uninstall` remain reserved and disabled. Workflow commands remain in Skill/project scripts.

The locked-checkout equivalent is:

```bash
node bin/buildbeat.js init /path/to/project --dry-run --json
node bin/buildbeat.js init /path/to/project             # plan + interactive confirmation
node bin/buildbeat.js adopt /path/to/project --yes      # non-interactive only after plan approval
node bin/buildbeat.js upgrade /path/to/project --dry-run --json
node bin/buildbeat.js upgrade /path/to/project          # apply only when the complete plan is ready
```

`--yes` skips only the `init/adopt` prompt; `--dry-run --yes` is invalid. If no interactive terminal is available, an apply call without `--yes` returns `confirmation_required` and performs zero writes. `upgrade` has no `--yes`; naming the write command is the explicit apply request, and `--force`/`--major` acknowledge only their documented narrow boundaries. JSON apply keeps the machine result on stdout and prints the pre-write human plan on stderr.

Wave 1 has bounded BuildBeat real-directory, Git, hook, evidence-commit, and Gate3 closure in [`PHASE2-BUILDBEAT-PILOT-2026-08-25.md`](PHASE2-BUILDBEAT-PILOT-2026-08-25.md). The `v1.16 → v1.20` schema 2 upgrade and real multi-repository refresh are archived in [`PHASE4-V1.20-PILOT-2026-08-25.md`](PHASE4-V1.20-PILOT-2026-08-25.md). None of these project tests substitute for npm artifact verification.

The target command whitelist is intentionally small:

| Milestone | Enabled main commands | Boundary |
|---|---|---|
| legacy `solobaton@1.16.3` | `doctor`, `init --dry-run`, `adopt --dry-run`, `version` | independently verified read-only v0; deprecated distribution ID after scoped migration |
| BuildBeat `1.21.0` | `doctor`, `init`, `adopt`, `upgrade`, `version` | unchanged Phase 0–3 command set; writes remain bounded by the transaction and human-Gate contracts below |

`help`, `--help`, and `--version` are meta entry points. `diff` and `uninstall` stay reserved and return `command_not_available`; `gate`, `adr`, `standards`, `check`, and other workflow commands are outside the approved CLI scope. HELP text and regression tests must lock this boundary.

Exit codes:

| Code | Meaning |
|---:|---|
| `0` | The inspection/plan completed and has no blocker-level finding |
| `1` | The command completed, but the project has an error or lifecycle blocker |
| `2` | Usage/confirmation error, or a reserved command that the running version does not support |

## CLI package lifecycle is not project lifecycle

The public npm package gives the executable a conventional, reversible distribution path:

| Intent | Command | Project effect |
|---|---|---|
| Current one-off run | `npx --yes --package=@haiyangbg/buildbeat@latest buildbeat doctor <project>` | Runs the registry version without a persistent global installation |
| Resolve an exact version | `npm view @haiyangbg/buildbeat@latest version` | Records the version to substitute for `@latest` in a reproducible invocation |
| Install or update the global CLI | `npm install --global @haiyangbg/buildbeat@latest` | Replaces only the globally installed package and executables |
| Remove the global CLI | `npm uninstall --global @haiyangbg/buildbeat` | Removes only the global package and executables |

Package-manager operations never create, update, or remove a project's scaffold. `buildbeat upgrade` is a separate schema-2-only project lifecycle; `buildbeat uninstall` and its legacy alias remain disabled. Removing an `npx` cache is also outside BuildBeat's project lifecycle.

## Skill and CLI responsibilities

| Layer | Owns | Must not claim |
|---|---|---|
| `SKILL.md` | code-aware inspection, minimal human questions, project-specific reasoning, Gate semantics | deterministic installation state or safe file ownership by itself |
| CLI | bounded filesystem inspection, plans, manifest/hash handling, repeatable lifecycle mechanics | product judgment, contract discovery, Agent runtime, or automatic Gate approval |
| Scaffold files | project facts, decisions, contracts, status, evidence | that template defaults are current project facts |
| Shell guardrails | deterministic local checks | server-side enforcement or live production truth without project adapters |

An AI-assisted bootstrap should consume CLI JSON as evidence, inspect the code for facts the CLI cannot infer, ask only the remaining simple questions, and obtain the existing one-screen confirmation before any write-capable release is allowed to apply a plan.

## File ownership policies

The manifest records the installed baseline hash of every lifecycle-managed path. “Managed” never means “overwrite regardless of local edits.” Policy validity is schema-specific:

- schema 1 remains readable and may contain the historical `three-way-only` value;
- schema 2 may contain only `replace-if-unmodified`, `project-owned`, and `merge-only`;
- new plans and writes must never emit `three-way-only`.

| Schema 2 policy | Examples | Write/upgrade rule |
|---|---|---|
| `replace-if-unmodified` | `AGENTS.md`, `BUILDBEAT.md`, operator card, `CLAUDE.md` pointer, reviewer, unconfigured managed scripts | Replace only when the current hash still equals the installed baseline; otherwise report a conflict. `--force` may replace this class after an explicit warning. |
| `project-owned` | architecture, contract, boards, decisions, status, configured `verify-status.sh` | Initial scaffold may create a non-colliding template. Upgrade never creates, replaces, or deletes it; provide migration instructions or a patch candidate instead. `--force` does not override this rule. |
| `merge-only` | the owned `.gitignore` fragment | Modify only the uniquely marked fragment. Never replace the host file; missing, duplicated, or locally changed markers are conflicts. |

The `.gitignore` host file is represented by `integrations.gitignore`, not duplicated in `files`. Hooks remain outside CLI writes. The compact layout maps the five scripts, operator card, and version marker into `pm/`; root `AGENTS.md`, `CLAUDE.md`, `.claude/agents/`, architecture, contracts, and coordination records keep their established locations.

## Manifest contract

The canonical manifest path is `.buildbeat/manifest.json`. Doctor continues to read the legacy `.solobaton/manifest.json` path, but new scaffolds never create it. Schema 1 is the read-only compatibility shape already recognized by v0:

```json
{
  "schemaVersion": 1,
  "scaffoldVersion": "v1.16",
  "cliVersion": "1.16.3",
  "layout": "default",
  "installedAt": "2026-08-22T00:00:00.000Z",
  "files": {
    "scripts/bus-check.sh": {
      "policy": "replace-if-unmodified",
      "baselineSha256": "<64 lowercase hex characters>"
    }
  },
  "integrations": {
    "gitignore": null,
    "hooks": null
  }
}
```

Schema 2 is the first write-capable shape targeted by Wave 1:

```json
{
  "schemaVersion": 2,
  "scaffoldVersion": "v1.21",
  "cliVersion": "2.0.0-beta.3",
  "layout": "default",
  "installedAt": "2026-08-24T00:00:00.000Z",
  "files": {
    "AGENTS.md": {
      "policy": "replace-if-unmodified",
      "baselineSha256": "<64 lowercase hex characters>"
    },
    "contracts/PROTOCOL.md": {
      "policy": "project-owned",
      "baselineSha256": "<64 lowercase hex characters>"
    }
  },
  "integrations": {
    "gitignore": {
      "path": ".gitignore",
      "beginMarker": "# >>> buildbeat managed >>>",
      "endMarker": "# <<< buildbeat managed <<<",
      "baselineSha256": "<SHA-256 of the exact owned fragment bytes, including markers>"
    },
    "hooks": null
  }
}
```

Rules common to both schemas:

1. Only the documented top-level and nested fields are accepted. `installedAt` is a canonical UTC timestamp with milliseconds.
2. Paths are normalized POSIX repository-relative paths, cannot be absolute, cannot contain `.`/`..` traversal segments, cannot traverse symlinks, and must stay inside the target root.
3. Every file record contains exactly `policy` and a 64-character lowercase hexadecimal `baselineSha256`. The hash describes the exact bytes initially installed or last mechanically upgraded by the CLI, not the current bytes after project edits.
4. `files` records actual scaffold paths. It excludes both `.buildbeat/manifest.json` and the legacy `.solobaton/manifest.json`, excludes the source-only `gitignore.template`, and excludes the `.gitignore` host file represented under `integrations`.
5. No credential, environment value, file content, inferred private architecture fact, account identifier, or remote state enters the manifest.
6. Unknown schema versions and malformed known schemas fail closed. Validation uses a schema-specific policy set: schema 1 continues accepting its historical policies, while schema 2 rejects `three-way-only`.
7. A missing manifest means a legacy/unmanaged install. `doctor` may inspect it, but `upgrade` must not guess ownership or synthesize a baseline without an explicit adoption decision.
8. The manifest itself does not make a project healthy; unresolved placeholders, checks, evidence, and human Gates remain separate.

Schema 2 integration rules:

1. `integrations` contains exactly `gitignore` and `hooks`; `hooks` is `null` because hook installation stays a documented Skill/manual step.
2. `gitignore` is either `null` when no fragment was written, or the exact four-field object shown above. Marker strings are fixed constants, distinct, non-empty, and must occur exactly once in the host file before an automated fragment update.
3. `baselineSha256` covers the exact UTF-8 fragment bytes from the first byte of `beginMarker` through the final line ending after `endMarker`. A changed fragment is a conflict; `--force` may replace only that fragment, never the rest of `.gitignore`.
4. The manifest is written last. If it is absent after an interrupted write, later commands classify the target as partial/mixed and refuse to infer ownership.

## Scaffold write transaction (Wave 1 / BuildBeat 1.20)

A write-capable `init` or `adopt` must:

1. inspect without following symlinks and show the complete plan before any mutation; `--dry-run` performs this path and never asks for confirmation;
2. refuse mixed/partial/already-installed targets, unsafe paths, and every destination collision. Wave 1 has no project-file `--force`;
3. when the target root itself contains `.git`, require `git status --porcelain=v1 --untracked-files=all` to be empty. A parent repository does not substitute for a target-root repository;
4. copy the bundled template tree for the selected layout while excluding `standards/` and `pm/adr/` by the shared optional-prefix constant;
5. render only deterministic values—project name, the invocation's local calendar date, scaffold version, and layout (including compact-layout script references). Preserve every remaining canonical placeholder, return its path/token in `pendingPlaceholders`, and tell the caller to continue with `SKILL.md` §8 or §8.5;
6. print the final plan and require interactive confirmation. `--yes` skips only this prompt; it does not bypass dirty-worktree, collision, ownership, or path checks;
7. write each new file through a temporary sibling on the target filesystem followed by an atomic rename. Record every file and directory created by this invocation;
8. merge only the fixed, uniquely marked BuildBeat fragment into `.gitignore`. A pre-existing BuildBeat or legacy Solobaton marker without matching ownership metadata blocks the write. Do not install or change hooks;
9. write schema 2 manifest last, after all scaffold files and the integration fragment are durable; and
10. return the written paths, deterministic replacements, pending placeholders, manifest path, and next Skill/manual action. `doctor` may be run immediately, but pending placeholders are expected warnings until the AI rendering step finishes. A newly created target with no root `.git` must also keep the honest `git.not_initialized` finding until the Skill/manual path initializes Git; the CLI never does that itself. `bus-check` becomes a completion check only after Git and project facts are ready.

The write-capable JSON envelope increments `OUTPUT_SCHEMA_VERSION` from 1 to 2 and adds `writesPerformed`, `writtenPaths`, `manifestPath`, `nextAction`, `renderedPlaceholders`, and `pendingPlaceholders`. Each deterministic replacement is `{path, token, value}`; each unresolved entry is `{path, tokens}`. Dry-run returns the same replacement/pending inventory with `writesPerformed: false`, while successful apply returns the actual written paths with `writesPerformed: true`. The changelog identifies this output-schema change. Existing v0 doctor/plan fields keep their meaning.

In-process rollback is mandatory. On any failure before manifest completion, remove only the files and empty directories created by this invocation and restore an existing `.gitignore` to its exact pre-write bytes through an atomic replacement. Never delete or rewrite a path that predated the invocation. There is no persistent recovery journal: an abrupt process kill may require the user to inspect or restore the already-clean Git worktree, and the next CLI run must classify any manifest-less partial state as blocked rather than guessing.

No command may initialize Git, add a remote, commit, push, install a package globally, or cross a human Gate without separate explicit authority.

## Mechanical upgrade and manual removal

BuildBeat 1.20 implements `buildbeat upgrade [path] [--dry-run] [--json] [--force] [--major]`; the old executable remains only a compatibility alias. It is available only for one canonical BuildBeat installation, a valid canonical schema 2 manifest, and a clean target-root Git worktree. Schema 1, a missing/invalid/legacy manifest, a legacy marker namespace, or a mixed/partial installation is blocked; follow the [v1.16 legacy migration guide](LEGACY-V1.16-MIGRATION.md) for the manual-maintenance or explicitly approved re-baselining path instead of inferring ownership.

The JSON plan contains only bounded metadata: version-gate state, paths, policies, actions, SHA-256 values, blockers, warnings, and conflict eligibility/resolution. It never returns template or project file contents. Any unresolved conflict keeps apply mode at zero writes. A ready apply rechecks every expected hash or absence before mutation, prints the plan, updates the manifest last, and performs in-process byte/mode rollback on failure.

Version gates compare `manifest.scaffoldVersion` with the bundled `SCAFFOLD_VERSION`:

- equal version → no template upgrade is needed;
- installed version newer than the bundle → block; downgrade is not supported;
- newer bundle in the same major → eligible for mechanical upgrade;
- newer bundle in another major → block unless `--major` explicitly acknowledges the major transition.

The planner evaluates the manifest baseline, current project bytes, and new bundled template without performing a three-way merge:

| State | Default action |
|---|---|
| `replace-if-unmodified`, current hash equals baseline, new template changed | atomically replace and record the new baseline hash |
| `replace-if-unmodified`, current file changed or is missing | conflict; leave it untouched |
| `project-owned`, whether existing or newly introduced upstream | never write, replace, or delete; emit a migration note or patch candidate |
| new `replace-if-unmodified` path with no collision | create it and add it to the manifest |
| template removed upstream | report it; do not automatically delete the project path |
| `.gitignore` fragment markers unique and fragment hash equals baseline | replace only the owned fragment and record its new hash |
| `.gitignore` fragment missing, duplicated, or changed | conflict; leave the whole host file untouched |

`--force` may overwrite a conflicting `replace-if-unmodified` path and may replace the owned `.gitignore` fragment between unique markers. It never touches `project-owned` paths, never replaces the `.gitignore` host file, and never turns an upstream deletion into automatic project-file deletion. Any conflict without `--force` makes apply mode fail closed after producing the complete conflict report.

An apply run updates managed files atomically, updates the managed `BUILDBEAT.md` version marker only under the same ownership rule, writes the updated schema 2 manifest last, runs `doctor`, and points the user to `bus-check`. A failed run uses the same in-process rollback boundary as Wave 1. Conflict output explicitly recommends opening an AI session to compare the current file with the new template and perform a semantic merge when appropriate.

There is no project `uninstall` engine in the approved command set. `buildbeat uninstall` and its legacy alias remain reserved `command_not_available` responses. A manual removal guide may use the manifest as an inventory, but it must instruct the user to compare hashes, remove only explicitly selected unchanged managed files, edit only the owned `.gitignore` fragment, preserve every `project-owned` path, and delete the manifest only after reviewing what remains. No recursive purge shortcut is permitted.

## Security and privacy boundary

- The legacy npm v0 is read-only. BuildBeat 1.20 Wave 1/2 commands perform only the documented local writes and make no network request. Lifecycle mechanics use only bundled templates and local Git/filesystem facts; package-manager download or publication is outside the project-lifecycle command.
- Project scans stop at four directory levels or 5,000 entries, skip common build/vendor directories, and never follow symlinks.
- JSON output contains paths, counts, capability/version metadata, finding codes, bounded placeholder tokens, and one bounded project-name candidate from `package.json`, the first README heading, or the directory name. It does not emit arbitrary source contents, dependency values, environment values, or secrets.
- Command availability and worktree checks execute only fixed `--version` or read-only Git calls with argument arrays and no shell interpolation.

Package publication remains a separate release action. Every published version must be tied to one immutable Git tag, pass the repository and packed-artifact checks, be read back from the official registry, and pass a clean-directory install plus executable smoke test. See [`RELEASING.md`](RELEASING.md). Documentation must not claim that a new `npx` version is available before those registry checks pass.
