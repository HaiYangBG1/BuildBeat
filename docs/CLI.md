# BuildBeat CLI lifecycle contract

Status: **current published CLI v0 remains read-only in the independently verified npm distribution** · product name `BuildBeat` · legacy npm package/version field `solobaton@1.16.3` · latest independently verified npm distribution `solobaton@1.16.3` · Node.js 20+ · zero third-party runtime dependencies. Phase 0–2 now have the local source baseline commit `b062f25`; it has not been pushed or published. The current checkout additionally contains the WP3.1 mechanical-upgrade source candidate and disposable Git-sandbox regressions. It has no independent real-project upgrade pilot yet, because the bundled scaffold is still `v1.16` and genuine Phase 2 schema 2 installs are already `v1.16`. Tags, releases, publishing, remote rename, and a future scoped-package decision remain unapproved.

The CLI does not replace `SKILL.md`. The Skill owns code-aware reasoning, minimal questions, project semantics, and human Gates. The CLI owns deterministic inspection, scaffold mechanics, manifest/hash bookkeeping, and bounded mechanical upgrade in the current source candidate. Synchronous file-bus checks remain authoritative in the project-local scripts specified by [`CHECKS.md`](CHECKS.md).

## Command boundary and phased availability

The currently published v0 boundary is:

```bash
npm view solobaton@latest version
npx --yes solobaton@latest doctor /path/to/project
npx --yes solobaton@latest init /path/to/project --dry-run
npx --yes solobaton@latest adopt /path/to/project --dry-run
```

Record the version returned by `npm view` and substitute that exact version for `@latest` when the invocation must be reproducible. These commands address the already-published legacy package. A repository checkout uses the canonical `node bin/buildbeat.js` entry point (for example, `buildbeat doctor` after linking/installing the source); `node bin/solobaton.js` remains a compatibility alias. Source commands run the checked-out version and must still be evaluated separately from npm distribution evidence.

- `doctor` reads an existing project and reports installation state, layout, version marker, required files, unresolved canonical placeholders, hooks, and capability dependencies.
- `init --dry-run` inspects a new-project target and emits the default-layout installation plan.
- `adopt --dry-run` inspects a brownfield target and emits the compact-layout takeover plan.
- `--json` returns a versioned JSON document for agents and CI.
- v0 never writes project files. Omitting `--dry-run` from `init` or `adopt` exits with code 2 and `write_phase_not_available`.
- `diff`, `upgrade`, and `uninstall` are reserved names. They remain disabled in v0.

The current source candidate is evaluated separately from that registry evidence:

```bash
node bin/buildbeat.js init /path/to/project --dry-run --json
node bin/buildbeat.js init /path/to/project             # plan + interactive confirmation
node bin/buildbeat.js adopt /path/to/project --yes      # non-interactive only after plan approval
node bin/buildbeat.js upgrade /path/to/project --dry-run --json
node bin/buildbeat.js upgrade /path/to/project          # apply only when the complete plan is ready
```

In this source candidate, `init/adopt` apply the bounded Wave 1 transaction specified below. `--yes` skips only the prompt; `--dry-run --yes` is invalid. If no interactive terminal is available, an apply call without `--yes` returns `confirmation_required` and performs zero writes. `upgrade` follows the separate Wave 2 contract below: `--dry-run` emits the full mechanical plan, while an invocation without `--dry-run` writes only when every prerequisite and ownership check is ready. It has no `--yes`; naming the write command is the explicit apply request, and `--force`/`--major` acknowledge only their documented narrow boundaries. JSON apply keeps the machine result on stdout and prints the pre-write human plan on stderr.

Wave 1 now has bounded local BuildBeat real-directory, Git, hook, evidence-commit, and Gate3 closure recorded in [`PHASE2-BUILDBEAT-PILOT-2026-08-25.md`](PHASE2-BUILDBEAT-PILOT-2026-08-25.md). Wave 2 currently has disposable Git-sandbox evidence only. Neither is npm-distribution or release evidence.

The target command whitelist is intentionally small:

| Milestone | Enabled main commands | Boundary |
|---|---|---|
| current v0 through Phase 2-A | `doctor`, `init --dry-run`, `adopt --dry-run`, `version` | read-only; optional template libraries do not change the write boundary |
| local Phase 0–2 baseline `b062f25` | `doctor`, `init`, `adopt`, `version` | Wave 1 writes implemented, sandbox-tested, locally piloted, and committed locally; not pushed or released |
| current WP3.1 source candidate | `doctor`, `init`, `adopt`, `upgrade`, `version` | Wave 2 mechanical upgrade implemented and sandbox-tested; no genuine newer-scaffold real-project pilot, push, or release |
| v1.19 target, after Wave 1 acceptance | `doctor`, `init`, `adopt`, `version` | `init/adopt` may write; dry-run remains available |
| v1.20 target, after Wave 2 acceptance | `doctor`, `init`, `adopt`, `upgrade`, `version` | `upgrade` is mechanical and schema-2-only |

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
| Current one-off run | `npx --yes solobaton@latest doctor <project>` | Read-only inspection using the registry's current release; no persistent global CLI installation |
| Resolve an exact version | `npm view solobaton@latest version` | Records the version to substitute for `@latest` in a reproducible invocation |
| Install or update the global CLI | `npm install --global solobaton@latest` | Replaces only the globally installed package and executable |
| Remove the global CLI | `npm uninstall --global solobaton` | Removes only the global package and executable |

Package-manager operations never create, update, or remove a project's scaffold. The canonical `buildbeat upgrade` and `buildbeat uninstall` commands—and their legacy `solobaton` aliases—are a separate project lifecycle and remain disabled in CLI v0. Removing an `npx` cache is also outside BuildBeat's project lifecycle.

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
  "scaffoldVersion": "v1.19",
  "cliVersion": "1.19.0",
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

## Scaffold write transaction (Wave 1 local source baseline)

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

## Mechanical upgrade source candidate and manual removal

The current source candidate implements `buildbeat upgrade [path] [--dry-run] [--json] [--force] [--major]`; the old executable remains only a compatibility alias. It is available only for one canonical BuildBeat installation, a valid canonical schema 2 manifest, and a clean target-root Git worktree. Schema 1, a missing/invalid/legacy manifest, a legacy marker namespace, or a mixed/partial installation is blocked; the CLI reports the manual migration or explicitly confirmed re-baselining path instead of inferring ownership.

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

- Published v0 is read-only. The local Wave 1 baseline and Wave 2 source candidate perform only the documented local writes, and neither path makes a network request. Wave 1/2 mechanics use only bundled templates and local Git/filesystem facts; package-manager download or publication is outside the project-lifecycle command.
- Project scans stop at four directory levels or 5,000 entries, skip common build/vendor directories, and never follow symlinks.
- JSON output contains paths, counts, capability/version metadata, finding codes, bounded placeholder tokens, and one bounded project-name candidate from `package.json`, the first README heading, or the directory name. It does not emit arbitrary source contents, dependency values, environment values, or secrets.
- Command availability and worktree checks execute only fixed `--version` or read-only Git calls with argument arrays and no shell interpolation.

Package publication remains a separate release action. Every published version must be tied to one immutable Git tag, pass the repository and packed-artifact checks, be read back from the official registry, and pass a clean-directory install plus executable smoke test. See [`RELEASING.md`](RELEASING.md). Documentation must not claim that a new `npx` version is available before those registry checks pass.
