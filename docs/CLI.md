# Solobaton CLI lifecycle contract

Status: **CLI v0 preview** · Node.js 20+ · zero third-party runtime dependencies.

The CLI does not replace `SKILL.md`. The Skill tells an AI session how to operate the delivery protocol; the CLI provides deterministic inspection and, in later versions, safe scaffold lifecycle operations.

## v0 command boundary

```bash
node bin/solobaton.js doctor /path/to/project
node bin/solobaton.js init /path/to/project --dry-run
node bin/solobaton.js adopt /path/to/project --dry-run
```

- `doctor` reads an existing project and reports installation state, layout, version marker, required files, unresolved canonical placeholders, hooks, and capability dependencies.
- `init --dry-run` inspects a new-project target and emits the default-layout installation plan.
- `adopt --dry-run` inspects a brownfield target and emits the compact-layout takeover plan.
- `--json` returns a versioned JSON document for agents and CI.
- v0 never writes project files. Omitting `--dry-run` from `init` or `adopt` exits with code 2 and `write_phase_not_available`.
- `diff`, `upgrade`, and `uninstall` are reserved names. They are deliberately disabled until the manifest-backed ownership rules below have an implementation and regression suite.

Exit codes:

| Code | Meaning |
|---:|---|
| `0` | The inspection/plan completed and has no blocker-level finding |
| `1` | The command completed, but the project has an error or lifecycle blocker |
| `2` | Usage error or a command/write phase that v0 intentionally does not support |

## Skill and CLI responsibilities

| Layer | Owns | Must not claim |
|---|---|---|
| `SKILL.md` | code-aware inspection, minimal human questions, project-specific reasoning, Gate semantics | deterministic installation state or safe file ownership by itself |
| CLI | bounded filesystem inspection, plans, manifest/hash handling, repeatable lifecycle mechanics | product judgment, contract discovery, Agent runtime, or automatic Gate approval |
| Scaffold files | project facts, decisions, contracts, status, evidence | that template defaults are current project facts |
| Shell guardrails | deterministic local checks | server-side enforcement or live production truth without project adapters |

An AI-assisted bootstrap should consume CLI JSON as evidence, inspect the code for facts the CLI cannot infer, ask only the remaining simple questions, and obtain the existing one-screen confirmation before any write-capable release is allowed to apply a plan.

## File ownership policies

The future manifest records the installed baseline hash of every lifecycle-owned path. “Managed” never means “overwrite regardless of local edits.”

| Policy | Examples | Upgrade rule | Uninstall rule |
|---|---|---|---|
| `replace-if-unmodified` | `bus-check.sh`, `pre-commit.sh`, `drift-check.sh`, reviewer, `CLAUDE.md` pointer | Replace only when the current hash still equals the installed baseline; otherwise report a conflict | Remove only when unchanged; retain modified files |
| `three-way-only` | `AGENTS.md`, operator card, `SOLOBATON.md` | Produce baseline/current/new comparison; never whole-file overwrite | Preserve by default |
| `project-owned` | architecture, contract, boards, decisions, status, configured `verify-status.sh` | Never automatically replace; provide migration instructions or a patch candidate | Always preserve |
| `merge-only` | `.gitignore`, existing hooks | Add/remove an identifiable owned fragment or recorded integration; never replace the host file | Remove only the recorded fragment and restore recorded hook configuration |

The compact layout maps the five scripts, operator card, and version marker into `pm/`; root `AGENTS.md`, `CLAUDE.md`, `.claude/agents/`, architecture, contracts, and coordination records keep their established locations.

## Manifest contract

A write-capable release must create `.solobaton/manifest.json`. Schema 1 is reserved as follows:

```json
{
  "schemaVersion": 1,
  "scaffoldVersion": "v1.16",
  "cliVersion": "1.16.0",
  "layout": "default",
  "installedAt": "2026-08-22T00:00:00.000Z",
  "files": {
    "scripts/bus-check.sh": {
      "policy": "replace-if-unmodified",
      "baselineSha256": "<sha256>"
    }
  },
  "integrations": {
    "gitignore": null,
    "hooks": null
  }
}
```

Rules:

1. Paths are normalized repository-relative paths and must stay inside the target root.
2. Hashes describe the exact bytes installed by the CLI; they are not hashes of current project state after user edits.
3. No credentials, environment values, file contents, or inferred private architecture facts enter the manifest.
4. Unknown schema versions fail closed. A missing manifest means a legacy/unmanaged install: `doctor` may inspect it, but automated upgrade/uninstall must not guess ownership.
5. The manifest itself does not make a project healthy; real verification and human Gates remain separate.

## Future write transaction

A write-capable `init` or `adopt` must:

1. inspect without following symlinks and show the complete plan;
2. refuse mixed/partial existing installations and unresolved path escapes;
3. render project facts with no canonical placeholders remaining;
4. stage output in a private temporary directory under the target filesystem;
5. merge `.gitignore` and hooks without replacing existing host content;
6. atomically place new files, then write the manifest last;
7. run document checks and `bus-check`; and
8. roll back files created by the failed transaction while preserving everything that predated it.

No command may initialize Git, add a remote, commit, push, install a package globally, or cross a human Gate without separate explicit authority.

## Future upgrade and uninstall

`upgrade --dry-run` will compare three states: the manifest baseline, the current project file, and the new bundled template.

- unchanged current + changed upstream → safe replacement candidate;
- changed current + unchanged upstream → keep project version;
- both changed → conflict with a three-way diff artifact, never silent overwrite;
- project-owned path → migration note only;
- missing/invalid manifest → blocked until an explicit legacy-adoption decision.

`uninstall --dry-run` will list only lifecycle-owned effects. Apply mode will remove unchanged managed files and recorded integration fragments, retain modified and project-owned files, and produce a preservation report. There will be no recursive “purge project data” shortcut.

## Security and privacy boundary

- v0 is read-only and performs no network request.
- Project scans stop at four directory levels or 5,000 entries, skip common build/vendor directories, and never follow symlinks.
- JSON output contains paths, counts, capability/version metadata, finding codes, and one bounded project-name candidate from `package.json`, the first README heading, or the directory name. It does not emit arbitrary source contents, dependency values, environment values, or secrets.
- Command availability checks execute only fixed `--version`/read-only Git configuration calls with no shell interpolation.

Package publication is a separate release action. Until an npm release is independently verified, documentation must use the repository-local `node bin/solobaton.js` command and must not claim that `npx solobaton` is available.
