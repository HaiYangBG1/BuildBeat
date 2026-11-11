# Decisions and evidence

[简体中文](07-approval-guide.md)

## Accepting the work description

A work has exactly one work.md. `buildbeat accept --repo . --work <ID>` records the digest of that file at that moment; once the file changes, the earlier acceptance no longer holds. Accepting does not start the work.

## Reader test

`buildbeat reader --repo . --work <ID> [--doc work|result]` hands one document to a read-only AI with no context: it is given only the text of that document, runs in a new empty directory outside the project, and answers a fixed set of questions (seven for work.md, five for result.md; the last asks what it still does not know and could only guess). Without `--doc`, result.md is read when there is one, work.md otherwise.

Three things come out: the answers it read out; what it could not answer; and, for the answers Git and the records can confirm, a ✓ or ✗ from the runtime. Only three are checked: for work.md, "which directories or files change" (the reader is asked for one path per item): once the work has commits, whether every file they changed (records under `delivery/` aside) was named or lies in a named directory; before that, whether every path named is inside `allowedPaths`; for result.md, "in which commit" against the approved commit, and "which documents were written" against the write-back lines Git confirms. With nothing to compare against, an answer is not checked, which is not the same as wrong.

Each result is appended to `delivery/work/<ID>/reader-tests.jsonl` with the document's digest and size. `status --work <ID>` shows `reader: work.md · answered <n>/<m> · unanswered <k> · checked <a>/<b> · <KB> KB`, and `reader: work.md changed since its reader test` once the document has changed. There is no total score, and neither acceptance nor closing is blocked; `accept` prints one reminder when the current work.md was never tested.

The reader is `workers.reader` from the config, or the command of `workers.reviewer` when that is absent, with the prompt `prompts/reader.md`. On a timeout, a crash, exit 75 or an unreadable answer the command exits 1 and records nothing. The runtime cannot stop a tool from reading other files; it only keeps the project away from the reader.

## Approving or rejecting a commit

After a review stops, `buildbeat status --repo . --work <ID>` lists the commit waiting for a decision, the verification and review evidence, the review findings, and commands you can copy as they are:

- Approve: `buildbeat decide --repo . --work <ID> --action approve --candidate <full SHA>`
- Reject: `buildbeat decide --repo . --work <ID> --action reject --reason <reason>`

Before approving, the runtime checks again: the commit waiting for a decision is this one, work.md is still the accepted one, the verification evidence is there, and no serious finding is undecided. If something does not match, it refuses; a commit hash that is not the waiting one reports `approval stale`. An approval only means this commit is ready to merge; merging, pushing and releasing are still done by a person.

When you find more to change: fix in a new commit and send it for review. The earlier round is superseded automatically; there is no need to reject first.

## Ruling on review findings

When you disagree with a finding, or decide not to change it for now: `buildbeat decide --repo . --work <ID> --action accept|dismiss --fingerprint <fingerprint> --note <reason>`. `dismiss` means the finding does not hold or will not be changed; `accept` means it is acknowledged but not changed in this round. A ruling is recorded on the work by fingerprint. When the same finding comes up again it is marked `reRaised` and no longer blocks an approval; a reworded one counts as a new finding.

## Release readback

Merging and releasing are done by a person. After a release, run `buildbeat release --repo . --work <ID> [--env <environment>] [--ref <ref>] [--note <which step>]`: it confirms that this work's approved commit is contained in `--ref` (default: the current HEAD), runs the read-only readback command from the config's `release:` section in the main checkout (same shape, environment allowlist and masking as the verification command), and appends the outcome, exit code, commit, environment, output digest and the last few lines to `delivery/work/<ID>/releases.jsonl`.

One config serves every environment: `--env` goes into the readback record and is also passed to the readback command as `BUILDBEAT_RELEASE_ENV`, so the project's script checks by environment. For a release in several steps, read back each step once and use `--note` to say which step it is. A work that was never sent for review and was finished directly in a session can record a readback too; it is bound to this work's newest code commit in `--ref`, and when none can be traced it is refused. A work that was sent for review needs an approved commit before a readback. A project that only records readbacks and does not review needs only `release:` in its config.

`buildbeat status --repo . --releases [--all-repos] [--json]` lists, per environment, which work, which commit, when and which step the latest passing readback was, and marks on the same line a failure that came after it. That answers "what is in production now". Do not copy facts that change like this into project files.

## Wrapping up and closing

Every work is wrapped up with a one-page result. Write `delivery/work/<ID>/result.md` following `templates/v2/result.example.md`: what was delivered and in which commit and version, what was decided, what is left and where it went, and what was written into the project's documents. Conclusions that will be needed later go into the project's own documents first and are committed; then result.md records each one as `- <path> @ <commit> — <what was written>`. Then close with `buildbeat decide --repo . --work <ID> --action close [--result <text>] [--note <text>]`:

- The `release:` in the project config is only the default readback command. A work whose own `run-config.yaml` has `release:`, or one that has already recorded a readback, can close only when its latest readback has passed, and the close decision is bound to that readback. Any other work can close once it has a result.md. A work cannot close while one of its rounds is running or waiting for a decision.
- The runtime records the SHA-256 of result.md as `resultDigest`. Without `--result`, the summary is the first line of result.md that is neither empty nor a heading (code blocks and HTML comments are skipped).
- Every write-back line is checked: the commit is already on the branch the main checkout is on, it really changed that file, and the file is not in this work's own directory. One line that does not hold refuses the close, and all problems are listed at once; the lines that all pass are recorded as `promotions`. With no such line, an empty list is recorded.
- `status --work <ID>` checks the write-back lines live at any time (✓/✗), so you can look before closing; when result.md changes after the close, status shows `result.md changed after closing`.

A work finished without being sent for review shows as `COMMITTED`: `buildbeat decide --repo . --work <ID> --action close --draft` drafts result.md from its commits; correct it against Git, then close.

## Who made the decision

Every decision records who made it and as what: `--by` gives the name, `--as human|agent` says whether it was a person or an AI session. Without `--as`, the runtime looks at where the command runs: run inside an AI coding tool (it recognises `CLAUDECODE`, `AI_AGENT`, `CODEX_SANDBOX` / `CODEX_THREAD_ID`; other tools can set `BUILDBEAT_ACTOR=agent`) it is recorded as an AI session, and the name defaults to the tool's name; otherwise it is recorded as a person, the name defaults to `git config user.name`, and when that is not set `--by` is required. When an AI session passes on a decision you stated in the conversation, it uses `--as human --by <your name>`, and the record notes "entered through an AI session".

`status --work <ID>` lists every decision (rulings on findings included) with its identity; when the latest approval came from an AI session, status marks it separately. Old records have no identity field; they show "identity not recorded" and are not guessed from the name. Accepting, approving and closing take `--note <text>` to record the person's own words or reason.
