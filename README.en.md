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

**2. Talk to a session (recommended)**: install the plugin in Claude Code and the session knows how to use BuildBeat.

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

Then move the work along in plain words:

| You say | The session |
|---|---|
| Prepare this feature | Writes `work.md`: goal, scope, what counts as done |
| Accepted, start | Records your yes and starts the run |
| Where are we, what do you need from me | Shows the current result, the test and review evidence, and what waits for you |
| I fixed it myself | Checks your commit, then tests and reviews it again |
| New session | Writes down anything not yet recorded; the next session carries on from the record |

**3. Or use the command line**: put the templates in your project (see "Files in your project" below), write `work.md` and the run config, then:

```bash
buildbeat accept --repo . --work WORK-X --by owner
buildbeat check --config delivery/work/WORK-X/run-config.yaml
buildbeat run --config delivery/work/WORK-X/run-config.yaml
buildbeat status --repo . --work WORK-X
```

`check` looks for problems in the config and environment first; `run` starts, and if it stops halfway, run it again to carry on. Step-by-step details are in the [quickstart](docs/v2/guide/01-quickstart.en.md).

Upgrading from 3.x: finish or cancel runs in progress with the original 3.x runtime before switching versions.

## What it looks like

The first review round of a work found one problem; it was fixed and tested again, the second review passed, and the run now waits for your go-ahead. An excerpt of real output (`…` marks omissions):

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


The `cost` line says how many review rounds ran, how many problems were found and how long people waited. The four `next` lines are your choices: approve this version, reject it, hand back your own fix, or ask for another repair round. An approval is tied to this version's commit; if the code changes after you reviewed it, the old approval no longer counts.

## Files in your project

```
your-project/
├── AGENTS.md, CLAUDE.md            tell AI tools this project uses BuildBeat
├── .gitignore                      add the two .buildbeat/ folders below
├── delivery/                       travels with Git
│   ├── envelope/
│   │   ├── worker.sh               wraps an AI tool as a step BuildBeat can call
│   │   └── prompts/                prompts for build, review and fix
│   └── work/
│       └── WORK-X/                 one folder per work
│           ├── work.md             what to do and what counts as done
│           ├── run-config.yaml     which AI, which tests, which folders it may change
│           ├── decisions.jsonl     accept, approve, close and other decisions
│           ├── review-findings.jsonl  problems the review found and your rulings
│           ├── releases.jsonl      checks after going live (only if used)
│           └── runs/RUN-X-01/
│               └── run-record.json this run's outcome, evidence and cost
└── .buildbeat/
    ├── notify.yaml                 optional: webhook or DingTalk alerts when you're needed
    ├── runtime/                    this machine only: live ledger, logs, screenshots
    └── worktrees/                  this machine only: isolated copies the AI works in
```

Everything under `delivery/` goes into Git, so switching sessions, tools, computers or people just means pulling the code and carrying on. `.buildbeat/runtime/` and `.buildbeat/worktrees/` stay on this machine; a run in progress does not travel with Git, so finish or stop it where it started.

The templates come with the npm package, in `$(npm root -g)/@haiyangbg/buildbeat/templates/`. People and AI tools without BuildBeat installed can still read these files and draft `work.md`. With several repositories, `buildbeat status --repo . --all-repos` shows every pending item at once.

## Boundaries

- **The AI only touches what it should**: build and fix can change only the folders the run config allows, review is read-only, and secrets in logs are masked by the rules you configure.
- **It doesn't decide for you**: merging, pushing, deploying and releasing all need your own authorization. After going live, `buildbeat release` runs the project's own checks and records them; the work is done only when they pass.
- **What it doesn't do**: it has no multi-user accounts, roles and permissions, does not collect or upload project usage data and has no telemetry collection. The model and sign-in belong to the AI tool you configure.

To contribute, see [Contributing](CONTRIBUTING.md); the code is open source under the [MIT license](LICENSE).

> **Why the name**: every step is a note, and the agent plays them beat by beat; the score it has played (context, decisions and outcomes) stays in Git, ready to read again.
