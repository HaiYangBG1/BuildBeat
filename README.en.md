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

When you code with AI, every switch of session, tool, computer or person means explaining everything from the start.

BuildBeat is for humans and AI sessions. It keeps what needs doing, how far it got and what was decided in the project and Git, so whoever picks it up can carry on. Once the AI has written the code, it goes on to run the tests, review and fix problems, then stops and waits for your go-ahead.

## At a glance

<picture>
  <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-en-dark-narrow.png">
  <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-en-light-narrow.png">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-en-dark.png">
  <img src="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-en-light.png" width="100%" alt="The delivery loop: after work.md come build, verify and review; findings go to fix, verify and review again; then the run stops for you to decide; work.md, decisions, findings and each run's final record stay in Git">
</picture>

Each work gets one `work.md`. Once you say yes, `buildbeat run` starts in a separate worktree: build first, then run your project's own tests, then hand it to another read-only session for review; findings get fixed, then tested and reviewed again. BuildBeat reads the test results itself instead of relying on the AI's report. If it stops halfway, run `buildbeat run` again and it carries on.

It only stops when it needs a person: your merge decision, a used-up budget, a review that keeps finding new problems, or a broken environment (a missing tool, an unreachable service and the like, which never get "fixed" as code bugs).

## Start in five minutes

You need Node ≥ 20, Git and an AI command-line tool you are signed in to. The run config names who builds, reviews and fixes: Codex, Claude Code or any script.

**1. Install the runtime**

```bash
npm view @haiyangbg/buildbeat@latest version
npm install --global @haiyangbg/buildbeat@latest
buildbeat --version
```

**2. Talk to a session (recommended)**: install the plugin in Claude Code; its Skill ([SKILL.md](SKILL.md)) teaches the session how to use the runtime.

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

Then move the work along in plain words: "prepare this feature" → the session writes `work.md`; "accepted, start" → the run begins; "where are we, what do you need from me" → candidates, evidence and pending decisions. More phrases in [How to talk](docs/v2/guide/00-how-to-talk.en.md).

**3. Or use the command line**: follow the [quickstart](docs/v2/guide/01-quickstart.en.md) to put the templates in place and write `work.md` and the run config, then:

```bash
buildbeat accept --repo . --work WORK-X --by owner
buildbeat check --config delivery/work/WORK-X/run-config.yaml
buildbeat run --config delivery/work/WORK-X/run-config.yaml
buildbeat status --repo . --work WORK-X
```

Upgrading from 3.x: finish or cancel runs in progress with the original 3.x runtime first; see [Migration](docs/MIGRATION.md).

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

The `cost` line says how many review rounds ran, how many problems were found and how long people waited. The four `next` lines are your choices: approve this version, reject it, hand back your own fix, or ask for another repair round. An approval is tied to the candidate's commit; if the code changes after you reviewed it, the old approval no longer counts.

## Records and handoffs

End-to-end work packages keep the whole story of a work in the repository:

- `delivery/work/<ID>/` **travels with Git**: work.md, run config, decisions, review findings, each run's terminal record (outcome, cost, evidence digests and references)
- `.buildbeat/runtime/` **stays on this machine**: the run ledger, logs, screenshots and other raw evidence
- `.buildbeat/worktrees/` **stays on this machine**: the isolated worktrees that hold candidates

Save missing facts before switching sessions; active runs do not migrate through Git clone. People and tools without the runtime can still read status and write work descriptions. With several repositories, `buildbeat status --repo . --all-repos` shows every pending item at once.

[Session handoff](docs/v2/guide/11-session-handoff.en.md) · [Recovery](docs/v2/guide/10-recovery.en.md) · [Without the runtime](docs/v2/guide/12-without-runtime.en.md)

## Boundaries

BuildBeat does not provide multi-user accounts, roles and permissions. It does not collect or upload project usage data and has no telemetry collection. Models and authentication belong to the configured AI tool. Merge, push, deployment and publication remain separately authorized external actions; after a release, `buildbeat release` records the project's own readback and the window closes only when it passes. Production monitoring and arbitrary workflow/policy languages are outside the product.

[Capabilities](docs/CAPABILITY-MATRIX.md) · [Security](docs/v2/guide/09-security-boundaries.en.md) · [Migration](docs/MIGRATION.md)

## Read more

| To do this | Read |
|---|---|
| Set up a project for the first time | [Quickstart](docs/v2/guide/01-quickstart.en.md) |
| Talk to a session day to day | [How to talk](docs/v2/guide/00-how-to-talk.en.md) |
| Understand the fixed flow and the run config | [Workflow and configuration](docs/v2/guide/02-workflow-guide.en.md) |
| Approve, reject, read evidence | [Decisions and evidence](docs/v2/guide/07-approval-guide.en.md) |
| Hand over across sessions and people | [Session handoff](docs/v2/guide/11-session-handoff.en.md) |
| Contribute | [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE) |

> **Why the name**: every step is a note, and the agent plays them beat by beat; the score it has played (context, decisions and outcomes) stays in Git, ready to read again.
