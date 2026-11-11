# Session handoff

[简体中文](11-session-handoff.md)

Before closing a session, save the goal, decisions, unverified scope and next step. Check Git and `status`. Uncommitted changes are either committed or noted with where they are.

A new session reads AGENTS.md, this work's work.md, decisions and status. Verify available facts and reuse still-valid authorization. A round waiting for the human decision is still there; a new session is no reason to send the commit for review again.

To see where a whole piece of work stands, use `buildbeat status --repo . --all-repos --work <ID>`: works whose work.md or result.md carry relation lines (`- follows:`, `- split from:`, `- related:` with a work id) are strung into one thread, listed across repositories with each one's stage; the reverse directions are derived, and an id found nowhere shows as `NOT_FOUND`. Ids merely mentioned in prose are listed apart as mentions and mentioned by, outside the thread. With only a task, decision or merge request id at hand, `--ref <id>` finds the works that carry `- ref: <id>`.

Before changing a piece of code, ask which work it came from with `buildbeat history --repo . --path <file>[:<line>[-<line>]]`: the runtime blames those lines and maps each commit to a work through three facts only, namely a commit between the starting point and the reviewed commit of a recorded review round, a `Work: <ID>` trailer in the commit message, or a change under `delivery/work/<ID>/`. A commit with none of these counts for a work when its subject names exactly one work that has a folder under `delivery/work/`, reported `via subject`: a weaker clue, since subjects often mention another work, and a subject naming two or more counts for none. Lines still unexplained are counted, never guessed. `buildbeat hooks install --repo .` installs a hook that adds the `Work:` trailer to commits from now on. Read the result.md and work.md it lists before changing the code.

Before starting a work, or when picking up one written a while ago, read the `facts:` block of `buildbeat status --repo . --work <ID>`. When the facts section names the commit it was checked on in its heading and points at code as `path`, `path:<line>` or `path:<start>-<end>` in backticks, the runtime compares that code with where the work starts: the current HEAD before its first review (or `base` when the work's config sets it), the latest round's starting point after. With line numbers only those lines count; without, any change to the file. Code that changed is listed as changed with how many commits changed its file in between and the latest of them (the file's commits, not only those that touched the lines pointed at); a file that is gone, unknown or matches several files is listed as not found. Recheck those facts, update the section and the commit in its heading, and accept again. `accept` and `check` print a `warning: facts …` line in the same case and do not refuse. Closed works are not compared: their facts describe the code before the work, and result.md says what holds after it.

A work that status shows as `COMMITTED` was never sent for review and is not closed, but commits on the current branch change files outside `delivery/` and trace to it (a `Work: <ID>` trailer, or the same commit changing its folder). That says there are commits, not that the work is done: if it is still going, carry on; if it is done, `buildbeat decide --repo . --work <ID> --action close --draft` writes a result.md draft from those commits. Check it against Git and the work description, delete its first line and every `<fill in`, then close. Closing refuses the draft as written, or while any `<fill in` is left.

For a closed work, read its result.md first: what was delivered, what was decided, what is left and where it went, and what was written into the project's documents. Before drafting a new work, search the closed works' result.md for related conclusions and leftovers, and carry the ones that matter into the new work.md's "why now".

For a main repository managing several code repositories, start with `buildbeat status --repo . --all-repos`. This reads the main checkout and immediate child Git checkouts containing `delivery/work/`. Discovery deduplicates real paths and never recurses. A repository that cannot be read produces a warning; the others show as usual.

Pending decisions come first, followed by open work grouped by repository. CLOSED, CANCELLED and merged work that declares no release are counted only; the last are counted as `merged, not closed`, and single-repository `status` points them at closing out. Merged work that declares a release remains visible until closed. `--json` returns `{repos: [{repo, works, settled}], pending, warnings}` including settled work. `--work <ID>` filters to this work in each repository; `--run` cannot be combined with `--all-repos`. Each repository's works, reviews and decisions are recorded in its own `delivery/work/`; repository paths in suggested commands are relative to the current directory, so the commands can be run as they are.

A work with no work.md and only files from an old version shows as `LEGACY`: read its folder, or write result.md and close it.

Changing tools requires command, authentication and output-contract configuration. Records remain reusable; execution capability needs validation. Handoffs between people require commits, records, access and a named next owner/action.

Git transfers long-lived facts between machines. `.buildbeat/runtime/` does not come along with a clone: finished rounds have records to read, and a round still waiting for a decision must be sent for review again on the new machine.

A handoff example does not establish every tool combination as verified.
