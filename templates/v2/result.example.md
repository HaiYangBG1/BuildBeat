# WORK-ID result

What was delivered and where (merge commit, version, release), and who confirmed it. Status shows the first line of this paragraph.

## Decided
- Decisions later readers need, one line each; point to decisions.jsonl or a project document.

## Left over
- What was not done and where it went (another work, an issue). Write "none" when nothing is left.

## Written into the project
Conclusions that outlive this work, written into the project's own documents and committed before closing: a changed interface or format, a decision later works must follow, an environment fact that will bite again, a project document found wrong or stale, a worker prompt that should change. One line each, in this form:
- AGENTS.md @ <commit> — what was added or corrected

Closing checks every such line: the commit is on the branch, it changes the file, and the file is outside this work's folder. If nothing needed writing, say "none" and why.
