# Project delivery instructions

Load BuildBeat's Skill according to the host tool's rules. Read project-owned
constraints, delivery/work/<ID>/work.md, Git and status.
One Work owns one user-visible result. Continue safe authorized work to its
acceptance condition; intermediate commits are progress, not completion.

Use accept once the user has accepted the scope, review to send a commit for
verification and an independent read-only review, status to inspect (add --all-repos in a main
repository to include the repositories inside it),
decide for a real human decision, and check for diagnostics. Keep the binding
of approval to one commit and its evidence, allowedPaths and the read-only
review. Do not impersonate a human approval or silently weaken requirements.

Respect the host sandbox and environment contract. Missing tools or unavailable
backends are infrastructure failures (exit 75). Never print or commit secrets.
Stage only owned files. Merge, push, publication and deployment require their
own authorization. Existing project standards stay under project ownership.

The session writes and commits the change; BuildBeat checks that commit. Fix
what a review finds in a new commit and send it again. A review that was
interrupted is ended by the next one; nothing needs cleaning by hand.

Keep this file to rules and where to look. Do not copy facts that change,
such as the runtime version, what is in progress, who is doing what or what
is deployed: check them with `buildbeat --version`, `buildbeat status`
(`buildbeat status --releases` for what is deployed where) and Git. A wrong
line here misleads every session that reads it; delete it when you find it.
Operating rules and traps belong in the project's operations manual
(docs/operations.md, template templates/operations.example.md).
