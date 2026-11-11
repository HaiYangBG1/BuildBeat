# When something goes wrong

[简体中文](10-recovery.md)

There is no run to recover: a review round either finishes or is void, and the next review starts from the beginning.

- A round is `CANCELLED`: tool trouble. `status --repo . --run <RUN>` shows the reason and `check --repo . --work <ID>` shows the environment; `review` again once it is back.
- A round is `FAILED`: a problem with the commit. Read the verification log, fix in a new commit and send it.
- The review process was killed, or the machine was shut down: that round stays at running. The next review of the same work records it as `CANCELLED` and removes its checkout.
- The message `another review is running in this repository`: a round is running; wait for it to end. When the process holding the lock is gone, the lock is reclaimed automatically; a lock from another machine, or one whose holder cannot be identified, is kept.
- An approval is refused with `approval stale`: the commit waiting for a decision is no longer the one you wrote. Run `status --repo . --work <ID>` again and use the full commit hash it gives.
- A damaged ledger: only the valid first part is read, further writes to it are refused, and it is not repaired silently. Keep things as they are; sending for review again opens a new round.
- `.buildbeat/runtime/` was deleted: finished rounds have records in `delivery/work/<ID>/runs/` and show as usual; the round still waiting for a decision is gone, so send for review again.
- Records left by old versions need no change. A run of an old version that has not ended is finished or cancelled with the old version; an unclosed work in the old format shows as `LEGACY`: read its folder, or write result.md and close it.
