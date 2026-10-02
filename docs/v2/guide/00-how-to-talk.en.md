# How to talk to a session that has BuildBeat (by project stage)

[简体中文](00-how-to-talk.md) | **English**

> This page is for **users**. You work in any AI coding session (any tool will do, and one session is enough) that has loaded the BuildBeat Skill; you speak plainly, and the session calls `buildbeat`, reads the output and answers you as "done → not done → next". **You do not need to remember any command.** The example phrases below are what people normally say; copy them as they are. Phrases in the same cell mean the same thing; pick whichever comes naturally.
> The session-side rules that correspond to this page are in `SKILL.md` §0.5; project-specific routing and red lines are in each project's root `AGENTS.md`.

Before switching sessions, say "write the key context down, I am closing the old session"; in the new session say "read the project entry point, check progress and pending approvals, and carry on with this work". When handing over to a teammate, say "sync the project records and the candidate so the person taking over can check the current scope and the environment the original Run lives in". The detailed steps, and what an active Run needs to keep, are in [Session and team handoff](11-session-handoff.en.md).

## One table: a project from zero to the next phase

| Stage | What you want | Just say | What the session does behind it | What you get / watch for |
|---|---|---|---|---|
| **0. Not started** | Decide whether BuildBeat is worth it | "Is this project a good fit for BuildBeat?" | Looks at repository size, timeline, number of repositories / deployment units / sessions | A one-line verdict: worth it for multi-phase iterations / several repositories / several sessions; a job that wraps up within a week is simply done directly |
| | Set up a new project | "Set this project up with BuildBeat" "Initialise the collaboration skeleton" | Reads the code first → asks a few questions (stack, repositories, deployment units, whether there is a UI) → one confirmation screen → generates `AGENTS.md`, `delivery/` (with the envelope), `.buildbeat/observe.yaml`, `.buildbeat/notify.yaml`, a gitleaks pre-commit hook | One confirmation screen; it writes only after you say "OK", then lists the files it generated |
| | Take over an existing project | "Put this existing project on BuildBeat" "Take over this repository" | Surveys it (tests, contracts, deployment facts) → draws strangler boundaries (new ground / old ground / read-only) → phase 0 adds a minimal verification suite | A survey report plus a boundary draft; you decide the boundaries; history is not rewritten |
| | Turn on notifications | "Notify me when a Run stops" | Writes `.buildbeat/notify.yaml` (DingTalk / webhook) | It tells you which robot to create and which environment variable to `export`; the URL never enters Git |
| **1. Start a work · settle the approach** | Start something | "Open a Work: 〔one-line goal〕" "Turn the current goal into a Work" | Writes `delivery/work/<ID>/intent.md` (why, and what counts as done) + `plan.md` (how, in how many steps) + `run-config.yaml` | A summary + "say accept once you have read it"; only your "accept" makes the digest binding take effect |
| | See the approach before any code | "Don't touch the code yet, give me the approach" "Tell me the difference between A and B" | Produces drafts and comparisons only; no Run starts | A comparison + a recommendation + consequences; nothing is built before you decide |
| | Pick out what is mine to decide | "What in this approach needs my decision?" "Is there anything I need to decide?" | Compresses the acceptance list into real trade-offs (including names you will say out loud later: domains, service names, durations) | 2–5 decision items at once, each with a recommended value; no chain of one-by-one questions |
| | Decide | "Accept" "Go with all the recommendations" "Take B for the second one, recommendations for the rest" | `accept` the intent/plan; decisions land in `decisions.jsonl` / `pm/decisions.md` | A one-line confirmation; editing the plan makes the acceptance stale automatically, and it must be accepted again |
| | Set the risk level | "Use the fast track for this" "Be stricter with this one" | `riskPreset: fast / standard / controlled` | fast stops only before the merge; standard adds plan acceptance; controlled adds intent acceptance and the release gate |
| **2. Get ready to run** | Check the environment | "What does the environment need?" "Run a preflight" | Checks `requires:` (binary versions + `probe:` probes); `preflight --step` dry-runs up to the first failure boundary | Everything missing reported at once; a dry run produces no evidence, a real Run has to reproduce it |
| | Freeze the envelope | "Pin the prompts" "Freeze the envelope" | Adds `pin: <sha>` under `envelope:` | Every Run from then on records the envelopeDigest, so it can be traced |
| **3. Run · move forward** | Put it to work | "Go" "〔WORK-ID〕, your turn" | `start --config … --attempt new` (numbered automatically, older waiting runs superseded, started detached) | "RUN-X-02 has started; I will tell you when it stops at the merge decision" |
| | See progress | "Where are we?" "Current progress" "Per repository, please" | `overview` (each Work's stage + whose move is next) + `observe status` | One line per item: stage, who it is waiting on, next; no commands listed |
| | See the next step | "What's next?" "What do you need from me?" | The `next` lines of `overview`, only those in your hands | Only what you have to do: DNS, credentials, approvals, hands-on actions |
| | Worried it is stuck | "How's it going?" "Is it stuck?" "It has been half an hour, is that normal?" | `status --run` (time per step, historical median, last output, STALLED) | One line with numbers: "verify has run 14 minutes, the historical median is 6, last output 2 minutes ago, still moving"; a suspected stall is said plainly |
| | See what is waiting for me | "What needs my approval?" "What's waiting on me?" | `inbox` + `delivery/observe/intents/` | Item by item: what it waits for, where the evidence is, a recommended A/B |
| | Approve / refuse | "Approve" "Approve RUN-X" "Reject, because …" | `approve` / `reject`; after approving a non-terminal transition, `resume` continues the run | It says which step you approved: release the fixer / run once more / the merge decision; the merge decision only says the candidate is fit to merge, and merge / push / deploy are separate things you ask for |
| | Rule on a finding | "This one doesn't count, accept that one" "This is a false positive" | `findings adjudicate dismiss/accept` → releases the fixer | The same dismissed finding no longer blocks; a higher severity reopens it |
| | Another round | "One more round" "Continue" | A new attempt | The old waiting run is superseded automatically; the inbox shows only live items |
| | Stop | "Stop if it fails again this time" "Stop for now" | Caps the rounds; `stop --reason` records it, and the candidate and evidence are kept | Done / not done / next, with hashes; then you decide whether to change the approach, fix it by hand or close the Work |
| **4. Acceptance · merge** | Accept the result | "Run acceptance" "Check the RUN-X candidate" | The testing perspective verifies the exact candidate independently; the report lands in the Work directory | Pass / fail + evidence; the writer's own word is not evidence |
| | Merge | "Go ahead and merge" "You may push" | A human action carried out by the session (within the red lines in `AGENTS.md`), then read back from the remote | The hash after the merge; `overview` shows MERGED |
| **5. Release** | Release | "Release it" "Get ready to release" | The `release-readback` preset + `riskPreset: release`: read back first → stop | "Readback is all green; now it is your turn to do 〔the action〕; tell me when it is done" |
| | I have done it | "Done" "Half done, check it for me" | Approves apply-readback → readback + observation → stops at closing the window | What is still missing, item by item; any failed step stops it |
| | Decide the release card | "Approve the release" "Don't release yet" | Carries out / does not carry out the decision card | Production actions are always yours; it only reads back and records |
| | Production alert | "Production is alerting" "Run a health check" | `observe run` → drafts queued | A one-line draft + "fix_now / schedule / dismiss, your call" |
| **6. Wrap up · next phase · retrospective** | Close something | "This Work is done" "Close this Work" | Records the decision, confirms the run-record is in the Git plane | `overview` stops listing it as open |
| | Clean up | "Tidy up" | `gc` (the plan first; `--apply` once you nod) | How many worktrees were cleaned; any candidate reachable only from its branch is always kept, with the reason |
| | Next phase | "Start the next phase" "Move on to the next phase" | The phase-change compaction ritual: archive, truncate, reset pointers, ask what to feed back | One screen of checklist; the new phase starts from a clean entry point |
| | Retrospective | "Review what BuildBeat did for us" "What went well and what didn't?" | `metrics` + Run ledgers + session records | Positives / negatives / changes, with numbers |
| | Keep the lesson | "Write down what we learned from this blocker" | Writes `pm/<date>-<topic>.md` + `env-facts.md`, and turns what can be checked by machine into `requires:` probes | The next window refers to it directly instead of passing it on by word of mouth |
| | Feed back upstream | "What could BuildBeat itself learn from this?" | Compares against lessons to find new pitfalls | A candidate list, each item A/B/C |
| | Upgrade | "Update the BuildBeat version" | Updates `BUILDBEAT.md` / `AGENTS.md` / `.buildbeat/*.yaml`, runs `doctor` | The version marker + the doctor report |

## Phrases that work at any stage

| You say | It will |
|---|---|
| "Why?" "What happens if we don't?" "Where did this name come from?" | Explain in plain words, and turn what is yours to decide (names, durations, scope) into decision items for you to approve instead of deciding for you |
| "Plain words, please" "No numbered lists" | One line each for done / not done / next; separate items only when they really differ |
| "What do you think?" | Give one recommendation and the reason, not a pile of options |
| "Authorised" or "Approved" on its own | Applies only to the one thing it explicitly proposed just before, never to other actions |

## Three baselines (so you don't have to ask)

- **Approval ≠ execution**: merge, push, deploy, spending and deletion each need you to say so, one by one.
- **Numbers must be concrete**: asking "is this normal?" always gets elapsed time / historical median / time of last output; with no data it says there is no data.
- **Names go through you first**: domains, service names, environment names, auto-stop durations — anything you will say out loud later — come as recommended values on a decision card for you to approve; the session does not decide them itself.
