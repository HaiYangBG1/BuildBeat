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

Tell the AI what you want and it first writes a `work.md` for you to read: goal, scope, what counts as done. Once you say yes, it starts in a separate copy: write the code, run your project's own tests, then hand it to another read-only AI for review; findings get fixed, then tested and reviewed again. BuildBeat reads the test results itself instead of relying on the AI's report. If it stops halfway, say "continue" in any session and it carries on.

It only stops to ask you when it needs you: the work is done and waits for your go-ahead, the budget is used up, a review keeps finding new problems, or the environment is broken (a missing tool, an unreachable service and the like, which never get "fixed" as code bugs).

## Get started

You need Node ≥ 20, Git and an AI coding tool you are signed in to. The config says which AI builds, reviews and fixes: Codex, Claude Code or any script.

**1. Install the runtime once** (or just ask the AI to install it)

```bash
npm view @haiyangbg/buildbeat@latest version
npm install --global @haiyangbg/buildbeat@latest
buildbeat --version
```

**2. Install the plugin in Claude Code** so the AI knows how to use BuildBeat. With another AI tool, have it read `SKILL.md` from the npm package first.

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

**3. From then on, just talk to the AI**; it runs the commands:

| You say | The AI |
|---|---|
| Use BuildBeat in this project | Puts the files in place from the templates, fills in the config and checks that it can run |
| Prepare this feature | Writes `work.md` for you to read |
| Accepted, start | Records your yes, then builds, tests, reviews and fixes |
| Where are we, what do you need from me | Tells you the result, the test and review evidence, and what waits for you |
| Approve / fix it again / I fixed it myself | Records your decision; repairs, tests and reviews again if needed |
| Continue | A new session carries on from the records in the project |

To type the commands yourself, see the [quickstart](docs/v2/guide/01-quickstart.en.md). Upgrading from 3.x: let the old version finish or cancel work in progress before switching versions.

## What it looks like

**Starting a work**

> **You**: Add CSV export to the ledger.
>
> **AI**: I wrote `work.md`: export the entries currently filtered, quote fields that contain commas, and it's done when all tests pass. Does that look right?
>
> **You**: Yes, go.
>
> **AI**: Started. I'll call you when it's done or when I need you.

**The next day, in a new session**

> **You**: Where are we?
>
> **AI**: "CSV export" is done and waiting for your go-ahead. The first review caught one problem: fields with commas weren't quoted. That's fixed and retested, and the second review passed. Approve it as is, or should I change anything?
>
> **You**: Approve and merge it.
>
> **AI**: Done, it's merged.

**Stuck halfway**

> **AI**: I've stopped: the tests need the local database, and it isn't running. That's not a code problem, so I haven't touched the code. Start the database and tell me, and I'll carry on.
>
> **You**: It's up, continue.

**You changed something yourself**

> **You**: I reworded the button myself and committed it.
>
> **AI**: Got it. I'll test and review your change again and call you for the go-ahead once it passes.

<details>
<summary>What the AI sees behind the scenes in the new-session example</summary>

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

</details>

## Files in your project

The first time, the AI puts these files in place from the templates:

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

People and AI tools without BuildBeat installed can still read these files and draft `work.md`. With several repositories, ask "where are all the repos at" and the AI lists every pending item at once.

## Boundaries

- **The AI only touches what it should**: build and fix can change only the folders the run config allows, review is read-only, and secrets in logs are masked by the rules you configure.
- **It doesn't decide for you**: merging, pushing, deploying and releasing all need your own authorization. What you approve is the version you looked at; if the code changes afterwards, it needs approving again. After going live, the AI runs the project's own checks and records them; the work is done only when they pass.
- **What it doesn't do**: it has no multi-user accounts, roles and permissions, does not collect or upload project usage data and has no telemetry collection. The model and sign-in belong to the AI tool you configure.

To contribute, see [Contributing](CONTRIBUTING.md); the code is open source under the [MIT license](LICENSE).

> **Why the name**: every step is a note, and the agent plays them beat by beat; the score it has played (context, decisions and outcomes) stays in Git, ready to read again.
