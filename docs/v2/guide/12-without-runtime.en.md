# Skill and project files only

[简体中文](12-without-runtime.md)

One person or a whole team can keep each requirement's context in Git with nothing but BuildBeat's Skill and the project's files: why it is done, what was checked, what was decided, what was delivered and what was written into the project's documents. It is all plain text that an AI coding tool writes by following the rules; it needs neither Node nor the `buildbeat` runtime. It works on machines without Node, on locked-down company computers and in web AI chats, and it is where to start when you recommend BuildBeat to colleagues.

## What you get, and what the runtime adds

| | Skill and project files only | With the runtime as well |
|---|---|---|
| Requirement context | `work.md`, decisions, `result.md`, relation lines, facts with code pointers and `Work:` trailers in commits, all in Git with the code | The same, and the runtime checks them: whether an acceptance went stale, whether a write-back's commit is on the main branch, whether the code a fact points at changed, which work a line of code came from |
| Doing the work | Your AI tool edits code and runs tests as usual; merging follows the project's own process | Automatic build, verify, review and fix in isolated worktrees, stopping with evidence at a person's merge decision |
| Progress | Read the files under `delivery/work/` | `buildbeat status` sums up every work and every pending decision |

With files only there is no automatic loop, isolated worktree, approval binding, budget or recovery, and an AI must not claim any of them. Tests you run yourself are reported as run by you.

## How to start

Paste this to your AI coding tool (Claude Code, Codex and Cursor all work) and it sets the project up. The project is shared, so set it up this way whichever tool each person uses.

```text
Please set up this project to record requirements the BuildBeat way, without the runtime for now (https://github.com/HaiYangBG1/BuildBeat):

1. Read SKILL.md and docs/v2/guide/12-without-runtime.en.md in that repository, and from then on work the "Skill and project files only" way.
2. Copy templates/v2/work.example.md and templates/v2/result.example.md from that repository into this project's delivery/templates/.
3. Add one line to this project's AGENTS.md (create it if missing): requirements are recorded the BuildBeat way under delivery/work/<id>/, templates are in delivery/templates/, rules at https://github.com/HaiYangBG1/BuildBeat/blob/main/docs/v2/guide/12-without-runtime.en.md
4. Make sure delivery/ is not excluded by .gitignore or .git/info/exclude, then commit these changes.
5. Tell me in a sentence or two when it is ready. From then on I will just say what I want done.
```

With Claude Code you can also install the plugin, so every session loads the Skill on its own; the plugin carries the templates and this guide too, so no npm package is needed.

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
```

## Day to day

1. **Draft:** say what you want; the AI drafts `delivery/work/<id>/work.md` in the eight sections of `delivery/templates/work.example.md`, naming the commit it checked on in the facts heading and pointing at code as `path:<start>-<end>`.
2. **Accept:** once you have read and agreed, the AI appends one line to `decisions.jsonl` in the "Accept `work.md`" format below and computes the digest.
3. **Do the work:** edit, test and commit as usual, ending each commit message with `Work: <id>`; merging follows the project's own process.
4. **Close out:** after the merge, write `result.md` from `delivery/templates/result.example.md`. Conclusions later work needs go into the project's own documents first and are committed; `result.md` then records each as `path @ commit`. The AI can check with Git that the commit is on the main branch and changes that file.
5. **Close:** append the close line in the format below and commit `result.md` with `decisions.jsonl`.

When a new session or another person picks a work up, they read `work.md`, `decisions.jsonl` and `result.md` first; `git diff <commit in the facts heading> HEAD -- <path>` shows whether the code a fact points at has changed.

## What you can read

| File (under `delivery/work/<ID>/`) | Content |
|---|---|
| `work.md` | Goal, why now, facts checked, scope, decisions before starting, acceptance, implementation plan, stop conditions |
| `decisions.jsonl` | Acceptances, approvals, closures; one JSON object per line |
| `review-findings.jsonl` | Review findings and human verdicts |
| `runs/<RUN>/run-record.json` | Terminal state, candidate, evidence digests and cost of finished runs |
| `releases.jsonl` | Release readbacks after the merge |
| `result.md` | Written at closing: what was delivered, what was decided, what is left, what was written into the project's documents |

The ledger of a run in progress lives in `.buildbeat/runtime/` on the machine running it and is not in Git; that side's `buildbeat status` is authoritative for progress.

## What you can write

- **Draft or edit `work.md`.** An edit invalidates the existing acceptance; the runtime shows it as awaiting acceptance or stale.
- **Accept `work.md` as the work owner:** append a line to `decisions.jsonl`. `digest` is the SHA-256 of the `work.md` file content (for example `shasum -a 256 work.md`); `decisionRef` is `A-<ID>-<current line count + 1>`:

  ```json
  {"ts":"2026-10-04T08:00:00.000Z","decisionRef":"A-WORK-X-1","decision":"approved","transition":"accept-work","subject":{"artifact":"work","digest":"sha256:<64 hex digits>"},"by":"<name>","actor":{"kind":"human","id":"<name>","source":"flag"}}
  ```

- **Rule on a recorded review finding:** append a line to `review-findings.jsonl`. `fingerprint` must be an existing finding's fingerprint; `action` is `accept` or `dismiss`:

  ```json
  {"ts":"2026-10-04T08:00:00.000Z","kind":"adjudication","fingerprint":"<fingerprint>","action":"dismiss","by":"<name>","actor":{"kind":"human","id":"<name>","source":"flag"},"note":"<reason>"}
  ```

- **Write `result.md`** from `templates/v2/result.example.md`. Conclusions that later work needs go into the project's own documents first and are committed (the commit must already be on the main branch); result.md then records each one as `- <path> @ <commit> — <what was written>`.

- **Close a Work** that has no release readback set up (a documentation change, say, or any work in a team without the runtime, released or not): once `result.md` is written, append `{"ts":"2026-10-04T09:00:00.000Z","decision":"closed","transition":"close-work","subject":{"result":"<outcome>","resultDigest":"sha256:<64 hex digits>","promotions":[]},"by":"<name>","actor":{"kind":"human","id":"<name>","source":"flag"}}`. `resultDigest` is the SHA-256 of the `result.md` file content (for example `shasum -a 256 result.md`); `promotions` lists each promotion line of result.md as `{"path":"<path>","commit":"<full commit hash>"}`, or `[]` when there is none. A Work whose run config sets up a release readback (`release:`) closes through the runtime's `release` and `decide --action close`, which bind the closure to a readback.

- **Write relation lines** in a `work.md` you are drafting (before acceptance) or in `result.md`, one per line: `- follows: <id>`, `- split from: <id>`, `- related: <id>`, `- ref: <external id>`. They are plain text; someone with the runtime sees the linked works strung into one thread with `status --work`.

- **Write the facts section** with the commit you checked on in its heading and code pointed at as `path:<start>-<end>` in backticks. This is plain text too; without the runtime, `git diff <that commit> HEAD -- <path>` shows whether the code changed. Someone with the runtime sees what changed in `status --work`.

- **When you commit code or documents for a work**, end the commit message with a blank line and `Work: <ID>`. Someone with the runtime can then find the work from the code with `buildbeat history --path`.

`actor` says truthfully who decided: a person writes `"kind":"human"`; an AI tool deciding on its own writes `"kind":"agent"` with the tool's name as `id`; an AI tool passing on what a person said in the conversation writes the person's name with `"kind":"human"` and adds `"via":"agent-session"`. Older lines with `by` and no `actor` stay valid; status shows them as "identity not recorded".

Each line must be one complete JSON object; only append, never edit earlier lines. Commit the files. `delivery/` belongs in Git: do not exclude it in `.gitignore` or `.git/info/exclude`. Screenshots, archives and logs under it stay out of Git; the template already has the rules.

## What you must not do

- Approve or reject a run, or adopt a candidate: the runtime records these in the run ledger and re-reads the candidate and evidence before stamping.
- Write or edit a run ledger, `run-record.json`, `releases.jsonl` or any evidence; claim that the runtime's verification, review, release readback or promotion check has passed.
- Record a decision in someone else's name, or edit existing lines.

## Adding the runtime later

When you want the AI to build, verify, review and fix in isolated worktrees, want a machine to check the records above, or have enough works that you need everything in one view, install the runtime as in the [quickstart](01-quickstart.en.md). The files you already wrote stay as they are:

Run `buildbeat status --repo . --work <ID>`: a newly edited `work.md` shows as awaiting acceptance, and hand-written acceptance and adjudication lines take effect under the same digest and fingerprint rules; the promotion lines in `result.md` are checked live (✓/✗), and a `result.md` changed after the close is flagged. Then `buildbeat run --config <config>` carries delivery on. In one project, people with the runtime and people without it share the same files.
