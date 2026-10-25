# Session handoff

[简体中文](11-session-handoff.md)

Before closing a session, save the goal, decisions, unverified scope and next step. Check Git, candidate and run state. Preserve active ledgers and worktrees.

A new session reads AGENTS.md, work.md (or legacy intent/plan), decisions and status. Verify available facts and reuse still-valid authorization. A new conversation is not permission to start a duplicate run.

To see where a whole piece of work stands, use `buildbeat status --repo . --all-repos --work <ID>`: works whose work.md or result.md carry relation lines (`- follows:`, `- split from:`, `- related:` with a work id) are strung into one thread, listed across repositories with each one's stage; the reverse directions are derived, and an id found nowhere shows as `NOT_FOUND`. Ids merely mentioned in prose are listed apart as mentions and mentioned by, outside the thread. With only a task, decision or merge request id at hand, `--ref <id>` finds the works that carry `- ref: <id>`.

Before changing a piece of code, ask which work it came from with `buildbeat history --repo . --path <file>[:<line>[-<line>]]`: the runtime blames those lines and maps each commit to a work through three facts only, namely a recorded run's base..candidate range, a `Work: <ID>` trailer in the commit message, or a change under `delivery/work/<ID>/`; lines none of these explain are counted, never guessed from commit subjects. Read the result.md and work.md it lists before changing the code.

For a closed work, read its result.md first: what was delivered, what was decided, what is left and where it went, and what was written into the project's documents. Before drafting a new work, search the closed works' result.md for related conclusions and leftovers, and carry the ones that matter into the new work.md's "why now".

For a main repository managing several code repositories, start with `buildbeat status --repo . --all-repos`. This reads the main checkout, targets named by `repo:` in its `delivery/work/` run configurations, and immediate child Git checkouts containing `delivery/work/`. Discovery deduplicates real paths and never recurses. Missing or invalid targets and unreadable configurations produce warnings without hiding other repositories.

Pending decisions come first, followed by open work grouped by repository. CLOSED, CANCELLED and merged work whose configuration has no `release:` are counted only; the last are counted as `merged, not closed`, and single-repository `status` points them at closing out. Merged work with `release:` remains visible until closed. `--json` returns `{repos: [{repo, works, settled}], pending, warnings}` including settled work. `--work <ID>` filters the merged results; `--run` cannot be combined with `--all-repos`.

When a configured target has the matching work directory or a runtime ledger, its state, findings and decisions are authoritative and the work appears only under that repository. Suggested commands retain the main repository's configuration and use paths relative to the caller; fill in person/reason placeholders before executing. Work without target records remains under the main repository with its runtime target shown. Single-repository `status` also reads this one level of target state, preventing duplicate-start suggestions.

Changing tools requires command, authentication and output-contract configuration. Records remain reusable; execution capability needs validation. Handoffs between people require candidate, records, access and a named next owner/action.

Git transfers long-lived facts between machines. Active processes, runtime files, worktrees and host resources do not migrate with clone. Inspect the original environment before choosing how to continue.

A handoff example does not establish every tool combination as verified.
