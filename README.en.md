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

1. You say what you want; the AI first writes a `work.md` for you to read: goal, scope, what counts as done
2. You say yes; it writes the code in a separate copy and runs your project's own tests
3. Another read-only AI reviews it; findings get fixed, then tested and reviewed again
4. When it's done, it stops and waits for your go-ahead

BuildBeat reads the test results itself instead of relying on the AI's report. If it stops halfway, say "continue" and it carries on.

## Get started

Copy the text below into your AI coding tool (Claude Code, Codex or Cursor) and it installs and sets everything up itself:

```
Please set up BuildBeat (https://github.com/HaiYangBG1/BuildBeat) in this project:

1. Check that this machine has Node 20 or later and Git; if anything is missing, tell me how to install it.
2. Install or upgrade the BuildBeat runtime:
   npm view @haiyangbg/buildbeat@latest version
   npm install --global @haiyangbg/buildbeat@latest
   buildbeat --version
   If a 3.x version is installed and still has unfinished work, finish or cancel it with the old version before upgrading.
3. Read SKILL.md and docs/v2/guide/01-quickstart.en.md from the npm package (under $(npm root -g)/@haiyangbg/buildbeat/) and work the way SKILL.md describes from now on.
4. Following the quickstart, put the templates into this project and update .gitignore. By default, use the AI command-line tool already signed in on this machine for building, reviewing and fixing; ask me if unsure.
5. When you're done, tell me in a sentence or two that we can start. From then on I'll just tell you in plain words what I want, and you run the commands.
```

Once it's set up, just talk to it; common situations are under "What it looks like" below.

<details>
<summary>Using Claude Code? You can also install the plugin</summary>

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

</details>

To install step by step yourself, see the [quickstart](docs/v2/guide/01-quickstart.en.md).

## What it looks like

**First time**

- **You**: (paste the text above)
- **AI**: All set, we can start.

**Starting a work**

- **You**: Add CSV export to the ledger.
- **AI**: I wrote `work.md`: export the filtered entries, quote fields with commas, done when all tests pass. Look right?
- **You**: Yes, go.

**New session, computer or person**

- **You**: Where are we?
- **AI**: "CSV export" is done and waiting for your go-ahead. The first review found unquoted commas; that's fixed and retested, and the second review passed.
- **You**: Approve and merge it.

**One more change**

- **You**: Empty lists should export too.
- **AI**: OK, I'll keep going, test and review again, and call you when it passes.

**You changed something yourself**

- **You**: I reworded the button and committed it.
- **AI**: Got it, I'll test and review your change again.

**Stuck**

- **AI**: I've stopped: the local database isn't running. That's not a code problem, so I haven't touched the code.
- **You**: It's up, continue.

**Several repositories**

- **You**: Where are all the repos at?
- **AI**: Three works across two repos: one waits for your go-ahead, two are still running.

It only stops to find you in these cases: the work is done and waits for your go-ahead, the budget is used up, a review keeps finding new problems, or the environment is broken.

<details>
<summary>What the AI sees behind "Where are we?"</summary>

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

## What a work is

**What**: the smallest unit BuildBeat keeps records in. One result you can see, like "CSV export", is one work, with one folder.

**Why**: the AI doesn't remember things, and sessions change at any time. What the work is for, how far it got, what review found and what you decided all go into that folder, so whoever picks it up carries on from there, and later you can look back at how it got done.

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
│           ├── result.md           written at closing: what was delivered, what is left, what went into project docs
│           └── runs/RUN-X-01/
│               └── run-record.json this run's outcome, evidence and cost
└── .buildbeat/
    ├── notify.yaml                 optional: webhook or DingTalk alerts when you're needed
    ├── runtime/                    this machine only: live ledger, logs, screenshots
    └── worktrees/                  this machine only: isolated copies the AI works in
```

- `delivery/` goes into Git: switching sessions, tools, computers or people just means pulling the code and carrying on
- `.buildbeat/runtime/` and `.buildbeat/worktrees/` stay on this machine: a run in progress does not travel with Git, so finish or stop it where it started
- People and AI tools without BuildBeat installed can still read these files and draft `work.md`

To contribute, see [Contributing](CONTRIBUTING.md); the code is open source under the [MIT license](LICENSE).

> **Why the name**: every step is a note, and the agent plays them beat by beat; the score it has played (context, decisions and outcomes) stays in Git, ready to read again.
