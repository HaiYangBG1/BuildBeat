# A review round and configuration

[简体中文](02-workflow-guide.md)

The session writes the code and commits it. The runtime does one thing: `buildbeat review --repo . --work <ID> [--commit <sha>]` sends that commit for verification and review.

A round is three fixed steps and cannot be configured:

1. Run the project's verification command in a temporary checkout of this commit.
2. When the verification passes, have the read-only reviewer look at this work's changes from its starting point to this commit. Without a configured reviewer this step is skipped: the round records the verify-only flow (`verify-only`) and everything shows "verified, not reviewed".
3. Delete the checkout and stop for the human decision.

The runtime does not write code, retry or repair. A round ends in one of three ways:

- `FAILED`: the verification failed, the commit changed a directory outside `allowedPaths`, or after the verification the checkout was not clean or HEAD had moved. This is a problem with the commit; fix it and send again.
- `CANCELLED`: a timeout, a crash, exit 75, a reviewer that handed in no report or an unreadable one, or a reviewer that changed files. This is a problem with a tool, not a verdict on the commit; send again when the environment is back.
- Waiting for the human decision: the verification passed and the review is done (or, with no reviewer configured, only verified). An approval is refused while a P0 or P1 finding is undecided.

Fix in a new commit and send it for review; an earlier round of the same work that is still waiting for a decision is recorded as `SUPERSEDED` automatically. A round whose review process was killed is recorded as `CANCELLED` by the next review. One repository runs one review round at a time.

When review after review of a work finds a P0 or P1, `review` prints a `stop:` line every fifth one in a row, and `status` shows `blocking streak: <n> reviews in a row found blocking problems`. A round that reviewed nothing (verification failed, a tool broke) neither counts nor resets it; a review with no blocking finding resets it. On `stop:`, do not fix again yet: show the user how many rounds in a row, where the findings keep coming from and whether the same place is being changed back and forth, and ask whether to narrow the work, rule on the findings, or keep fixing. It is a prompt, not a gate: the next review still runs.

## Configuration

A project has one `delivery/run-config.yaml`; the sample is `templates/run-config.example.yaml`:

- `workers.verifier`, `workers.reviewer`: the two commands (`command`, `args`, and optionally `timeoutMs`, `env`, `inheritEnv`). The verifier is required; the reviewer can wait, or be the tool you already use, see [Only one AI tool, or no review yet](04-adapter-guide.en.md#only-one-ai-tool-or-no-review-yet). The optional `workers.reader` is for the [reader test](07-approval-guide.en.md); without it the reviewer's command is used.
- `envelope`: the directory of the review prompts, and variables.
- `requires`: commands and minimum versions that must be there before a round starts; a missing one is reported plainly at once.
- `redact`: regular expressions for masking evidence logs before they are written to disk.
- `requireScreenshot: true`: for projects with a UI, see [Evidence](06-evidence-guide.en.md).
- `maxReviewSeverity`: defaults to `P2`, meaning P0 and P1 block an approval; with `P3`, P2 blocks too.
- `release`: the release readback command, see [Decisions and evidence](07-approval-guide.en.md).

When one work must differ from the project, write only the keys to override in `delivery/work/<ID>/run-config.yaml`. That file also takes:

- `allowedPaths`: the directories this work may change. The work's own folder is always allowed.
- `base`: the commit this work starts from. Without it, that is the last commit that changed its work.md, so work.md must be committed before the code.

An unknown key, a wrong type or a misspelling is reported all at once by both `buildbeat check --repo . [--work <ID>]` and `review`, naming the file.

A run id is `RUN-<work id without WORK->-<two-digit sequence number>`, one higher with each review.

Test frameworks must exclude `.buildbeat/**`, so they do not collect the tests in a temporary checkout.
