# Human approval guide

[简体中文](07-approval-guide.md) | **English**

Authority: [`RFC-0003 §5`](../RFC-0003-workflow-policy.md) (Chinese); implementation: `src/v2/runtime/decisions.js`. Principle: **a human approves a digest-bound subject, not a sentence that says "fine"**.

## What an approval binds

One approval = the quadruple `transition + candidate + planDigest + evidenceDigest`. If any of the four changes afterwards, the approval becomes `APPROVAL_STALE` on its own and the Run returns to `WAITING_HUMAN`: an old stamp never covers a new subject (zero reuse of stale approvals is an exit metric; the pilots measured zero).

## Daily commands

```bash
buildbeat inbox --repo .                 # every Run waiting for a human: transition, candidate, digest, reason
buildbeat status --repo . --run RUN-X    # the full derived view of one Run (steps, evidence, findings)
buildbeat approve --repo . --run RUN-X --transition enter-wait-merge --by <name> --config <run-config>
buildbeat reject  --repo . --run RUN-X --reason "<why>" --by <name>
buildbeat accept  --repo . --work WORK-X --artifact plan --by <name>   # artifact acceptance (digest-bound)
```

Decisions land in the Git plane at `delivery/work/<id>/decisions.jsonl`; the event ledger records `DECISION_RECORDED` at the same time.

## The safety semantics of approve (all tested)

1. **The transition must match** the pending request;
2. **Reality is re-read before stamping**: if the pending snapshot and reality disagree (the candidate moved, the plan changed), the approval is refused and a refresh is required; nothing is stamped;
3. **Transition gates are re-checked at the instant of stamping**: if merge-evidence-floor / ui-render-gate do not PASS right then, the approval is refused;
4. Approving a final decision (a pending request of the final-decision kind) means `RUN_TERMINAL SUCCEEDED` plus compacting the run-record into the Git plane.

## Five words and what each means (approving is not executing)

Sessions and documents used to mix "accept / approve / resume / succeeded / merged". The vocabulary is fixed as follows:

| Word | Command | Meaning | Is not |
|---|---|---|---|
| **Accept** | `accept --artifact intent\|plan` | A human endorses one artifact's digest; editing it makes the acceptance `stale` | Starting work; it creates no Run |
| **Approve a transition** | `approve --transition <t>` | Lets the Run take **this one** transition: `enter-fix` (release the fixer after triage), `resume-<step>` (run the step once more after a budget or infra stop; records `BUDGET_EXTENDED`), `enter-review` (one more review round after the Work-level cap), `enter-apply-readback` ("I have done it" on the release lane) | Approving any other transition; after a non-terminal transition is approved the Run **does not move by itself**: `resume --config <run-config>` continues it (the `next:` line printed by `approve` says so) |
| **Merge decision** (final approval) | `approve --transition enter-wait-merge` | The candidate is fit to merge: candidate + planDigest + evidenceDigest all hold at this instant; the Run reaches the terminal state `SUCCEEDED` and the run-record is compacted into the Git plane | Code merged, pushed or deployed: those three remain your actions outside the Runner, always |
| **Run SUCCEEDED** | — | The Run stopped where it should and the evidence is complete | The Work is finished. `overview` shows `MERGED` only after reading back that the candidate is on the current branch |
| **Reject** | `reject --reason` | The Run ends (`FAILED`, reason recorded) | The artifacts are invalidated; the acceptance state of intent/plan does not change |

Likewise, `fix_now` on an observe draft is only acceptance; a human starts the Run. Protected actions are listed under [Security boundaries](09-security-boundaries.md) (Chinese).

## Risk presets decide where humans approve

`fast`: Merge only; `standard`: Plan + Merge; `controlled`: Intent + Plan + Merge + Release. A pending request must carry the findings summary and the reason, which prevents the "rubber stamp" decay; human waiting time goes into `metrics`.

## The finding triage gate and anchored review

> Since 2.0.0-beta.3.
The biggest structural lesson of the thirty-round deployment campaign: **a finding is a prescription, not a fact**. A memoryless fresh reviewer writes contradictory prescriptions and overturns designs that were accepted long ago; routing a fixer automatically turns that oscillation straight into cost. Two mechanisms work together:

1. **The triage gate**: with `reviewTriage: required` in the run config, P0/P1 findings from review no longer dispatch a fixer automatically; the Run stops at `WAITING_HUMAN` (kind `finding-triage`) and the pending reason lists every finding fingerprint. A human adjudicates first, then `approve --transition enter-fix` releases the fixer (or `reject` ends the Run).
2. **The adjudication ledger**: every finding lands in the Git plane at `delivery/work/<id>/review-findings.jsonl` (fingerprint = hash of severity plus normalized text):

   ```bash
   buildbeat findings list --repo . --work WORK-X
   buildbeat findings adjudicate --repo . --work WORK-X --fingerprint <fp> --action dismiss --by <name> --note "<why>"
   ```

   After `dismiss`, the same fingerprint no longer blocks (raising it again is recorded visibly as `RE-RAISED`, but does not restart the loop); **a severity upgrade is a new fingerprint and blocks again on its own**: noise is suppressed, real signal is not, the same principle as observe's dismiss feedback.
3. **Anchor injection**: the reviewer (a readonly step) receives `anchor` in `BUILDBEAT_INPUT`, the full table of past findings and adjudications, and the envelope prompt should tell the reviewer that adjudicated conclusions must not be overturned; writing steps such as the fixer receive `findings` (last round's findings with their adjudication state), and the fixer repairs only accepted/open ones instead of guessing.

Adjudication memory lives in the Git plane; deleting the runtime does not lose it (covered by the same tests as invariant 23).

## Waiting must be able to find a person

> Since 2.0.0-beta.4 (iteration 08).
In the pilot workspace, 32 of 58 Runs were cancelled, most of them after hanging in `WAITING_HUMAN` for a full day; the average human wait was 7 to 12 hours. The cause was not slow people but **nobody knowing something was waiting for them**. Three things go together:

1. **What to say next**: `status` and `inbox` print the copyable command right after each wait (`approve` / `reject`, plus `findings list|adjudicate` during triage); `inbox` groups by Work and shows how long each has waited. The `--repo` in that output is a relative path inside the project and the placeholder `<repo-path>` outside it: a machine-local absolute path never enters the output.
2. **A new Run of the same Work supersedes the old wait**: on `start`, older Runs of the same Work that are still waiting are recorded as `SUPERSEDED` (terminal, compacted into a run-record), and the new Run's `RUN_CREATED.data.supersedes` records the lineage; the inbox keeps only live waits. Write `supersede: off` in the run config if you do not want this. RUNNING Runs are unaffected (active lock); old Runs locked by another process are skipped and reported.
3. **Outbound notifications**: `.buildbeat/notify.yaml` in the Git plane:

   ```yaml
   kind: notify
   version: 1
   channels:
     - id: owner
       type: dingtalk          # or webhook
       urlEnv: BUILDBEAT_NOTIFY_URL   # the URL comes only from an environment variable; a literal url is refused
       events:
         - HUMAN_REQUESTED
         - RUN_TERMINAL
         - STALLED
   ```

   The CLI sends when a Run stops for a human or reaches a terminal state; subscribing to `STALLED` makes `start`/`resume` spawn a detached `watch` process that watches for silent worker output (threshold `stallAfterMs`, default 15 minutes). A failed send is only logged to `runs/<RUN>/notify.log` and the screen and **never affects the Run**; the payload carries identifiers, the reason, the candidate SHA and the next command, with zero logs and zero candidate content. A DingTalk custom robot needs its keyword configured (default `BuildBeat`). `doctor` reports whether the channel and its environment variable are in place.

Notification is not an approval channel: decisions are still made only through the CLI, with digest binding unchanged.

## From "waiting for me" to "where are we": overview

> Since 2.0.0-beta.4 (iteration 08).
`inbox` only knows which Run waits for a human; `buildbeat overview --repo .` answers per Work "how far, whose move next": whether intent/plan are accepted (edited after acceptance means `stale`), the latest Run's state and candidate, whether the candidate is merged into the current branch, the number of unadjudicated P0/P1 findings, whether `env-facts.md` exists, each row with its next command. After the runtime is deleted, the Git-plane run-records fill in. A session runs it first, then answers "where are we".

**Stage truth corrections (iteration 09)**: once a candidate is merged into the current branch the Work is `MERGED`, even if the latest Run is CANCELLED (a pilot login Run was cancelled over a budget problem while its candidate was already in production, and overview reported `STOPPED_CANCELLED` and urged a retry); a Work whose `release-readback` lane closed successfully shows `RELEASED` instead of "nothing to merge"; merged / released / closed Works no longer report unadjudicated finding counts. Each Work in `overview` also carries a `cost:` line (see the Work-level budgets in the [Workflow guide](02-workflow-guide.md), Chinese).

## You fixed it yourself: `resume --adopt`

> Since 2.0.0-beta.5 (iteration 09).
When a Run stops at `enter-fix` / `resume-fix`, the driving session or a person has often already fixed the problem in the Run's worktree and committed it. Approving at that point dispatches a fixer with nothing to do and runs verify once more (a pilot frontend Run reached its 5th verify and 3rd fix this way). Use instead:

```bash
buildbeat resume --config <run-config.yaml> --adopt <sha> --by <name>
```

The kernel reads the worktree back: the tree must be clean and HEAD must be exactly `<sha>` (7-character prefix or longer), otherwise it refuses; then it records `CANDIDATE_PINNED` with a human actor (`adopted: true`), records `DECISION_RECORDED` with that commit as subject (`adopted`, `resumeAt`), and continues from verify (the step after a successful fix in the preset). The ledger shows who supplied this candidate. Adoption is not accepted at the merge decision.

`doctor` now also prints whether intent / plan exist and are accepted in this repository's `delivery/work/<ID>/`, and for every policy requiring `artifact.accepted` it previews where `start` will stop; before that, doctor passed twice while start was blocked by "plan not mirrored into the sub-repository".

## Visible names are gate decisions

> Since 2.0.0-beta.4 (iteration 08).
The `BATCH_AT_GATE` tier of the three approval tiers explicitly includes domain names, service names, environment names, auto-stop durations, window durations: **names and parameters the owner will later see or say out loud**. Names a worker picks in passing never reach the ledger; the planner lists them in the intent with recommended values, and the human approves them in one go.
