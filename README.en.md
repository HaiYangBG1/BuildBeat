<p align="center">
  <img src="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/hero.jpg" width="100%" alt="Five notes on a musical staff, build, verify, review, fix and decide, joined by a pulse line that ends in a stack of written sheet music">
</p>

<h1 align="center">BuildBeat</h1>

<p align="center"><strong>Switch sessions. Keep building.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@haiyangbg/buildbeat"><img alt="npm version" src="https://img.shields.io/npm/v/@haiyangbg/buildbeat?color=d97706&amp;label=npm"></a>
  <a href="https://github.com/HaiYangBG1/BuildBeat/actions/workflows/ci.yml"><img alt="CI status" src="https://github.com/HaiYangBG1/BuildBeat/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-e5534b"></a>
</p>

<p align="center"><a href="README.md">中文</a> · English</p>

> **Why the name**: every step is a note, and the agent plays them beat by beat; the score it has played (context, decisions and outcomes) stays in Git, ready to read again.

BuildBeat is for humans and AI sessions: the work description, decisions and each run's outcome stay in project files and Git; implementation, verification, review and repair move forward outside the session and can always resume; the candidate waits with its evidence for your merge decision.

## At a glance

<picture>
  <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-en-dark-narrow.png">
  <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-en-light-narrow.png">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-en-dark.png">
  <img src="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-en-light.png" width="100%" alt="The delivery loop: after work.md come build, verify and review; findings go to fix, verify and review again; then the run stops for you to decide; work.md, decisions, findings and each run's final record stay in Git">
</picture>

Each work gets one `work.md`. Once you accept it, `buildbeat run` moves it forward beat by beat in an isolated worktree: build, run the project's own verification commands, an independent read-only review, and on findings fix, verify and review again. It stops when a person is really needed: the merge decision, an infrastructure failure, an exhausted budget, a review that does not converge. The work description, decisions, review findings and each run's final record go into Git, so a new session, another tool or another person continues from the same record; the live ledger and raw logs stay on this machine (see Records and handoffs below).

## Three promises

### Walk away

**Close the session, switch AI tools or hand over, and the work carries on.** The work description and the run ledger live in the project, and `buildbeat run` resumes from them; in a main repository with several code repositories, `buildbeat status --repo . --all-repos` shows what is pending everywhere.

### Come back to facts

**What you find is evidence, not what an AI says about itself.** Verification runs the project's real commands and the runtime reads results back from Git and the ledger; review is independent and read-only; missing tools, an unavailable backend or a review that hands in no report stop as infrastructure failures instead of being "fixed" as code.

### Decide with confidence

**What you approve is the version you reviewed.** A merge approval is bound to the candidate (`--candidate`); a small problem spotted at the merge decision can be fixed and handed over (`run --adopt`) or sent back to the fixer in one line (`decide --action fix`); merge, push, release and deployment stay with people.

## Start in five minutes

The runtime needs Node ≥ 20. Before upgrading from 3.x, finish or cancel runs still in progress with their original 3.x runtime (see [Migration](docs/MIGRATION.md)). Read [SKILL.md](SKILL.md) and the [quickstart](docs/v2/guide/01-quickstart.en.md): put the templates in your project, write a `work.md`, and fill in the real AI tool and verification commands in the run config.

```bash
npm view @haiyangbg/buildbeat@latest version
npm install --global @haiyangbg/buildbeat@latest
buildbeat --version
```

```bash
buildbeat accept --repo . --work WORK-X --by owner
buildbeat run --config delivery/work/WORK-X/run-config.yaml
buildbeat status --repo . --work WORK-X
```

## What it looks like

The first review round of a work found one problem; the fixer repaired it, verify ran again, the second review passed, and the run now waits for your merge decision. An excerpt of real output (`…` marks omissions):

```text
$ buildbeat status --repo . --work WORK-CSV-EXPORT
WORK-CSV-EXPORT  MERGE_DECISION
  [P1 0b5e258117cb5602] (accept) csv: quote fields that contain commas
  work.md ✓ · runs 1
  cost: review rounds 2 · findings 1 · human waits 1 (open 33s) · worker 2s
work WORK-CSV-EXPORT:
  RUN-CSV-EXPORT-01 [final-decision] enter-wait-merge — waiting 33s
    candidate: ede20b668cb04ae30cba1676b5e031930e711c8d
    next: buildbeat decide --action approve … --candidate ede20b6… --by <you>
    next: buildbeat decide --action reject … --reason <why> --by <you>
    next: buildbeat run … --adopt <sha> --by <you>   # commit a manual repair in the run worktree …
    next: buildbeat decide … --action fix --reason <what to repair> --by <you>
```

The cost line shows how many review rounds ran, how many problems were found, how long people waited and where those waits went. The decision card offers four choices: approve (bound to this candidate), reject, hand over your own fix, or send it back to the fixer.

## Records and handoffs

End-to-end work packages keep the whole story of a work in the repository:

| Where | What | Travels with Git |
|---|---|---|
| `delivery/work/<ID>/` | work.md, run config, decisions, review findings, each run's terminal record (outcome, cost, evidence digests and references) | Yes |
| `.buildbeat/runtime/` | The run ledger, logs, screenshots and other raw evidence | No, this machine only |
| `.buildbeat/worktrees/` | The isolated worktrees that hold candidates | No, this machine only |

Save missing facts before switching sessions; active runs do not migrate through Git clone. People and tools without the runtime can still read status and write work descriptions.

[Session handoff](docs/v2/guide/11-session-handoff.en.md) · [Recovery](docs/v2/guide/10-recovery.en.md) · [Without the runtime](docs/v2/guide/12-without-runtime.en.md)

## Boundaries

BuildBeat does not provide multi-user accounts, roles and permissions. It does not collect or upload project usage data and has no telemetry collection. Models and authentication belong to the configured AI tool. Merge, push, deployment and publication remain separately authorized external actions; after a release, `buildbeat release` records the project's own readback and the window closes only when it passes. Production monitoring and arbitrary workflow/policy languages are outside the product.

[Capabilities](docs/CAPABILITY-MATRIX.md) · [Security](docs/v2/guide/09-security-boundaries.en.md) · [Migration](docs/MIGRATION.md)

## Claude Code plugin

The plugin supplies Skill, templates and docs; the runtime is installed separately.

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

## Read more

| To do this | Read |
|---|---|
| Set up a project for the first time | [Quickstart](docs/v2/guide/01-quickstart.en.md) |
| Talk to a session day to day | [How to talk](docs/v2/guide/00-how-to-talk.en.md) |
| Understand the fixed flow and the run config | [Workflow and configuration](docs/v2/guide/02-workflow-guide.en.md) |
| Approve, reject, read evidence | [Decisions and evidence](docs/v2/guide/07-approval-guide.en.md) |
| Hand over across sessions and people | [Session handoff](docs/v2/guide/11-session-handoff.en.md) |
| Contribute | [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE) |
