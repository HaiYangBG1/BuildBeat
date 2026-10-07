Your area: runtime and commands.
Files: src/v2/** and bin/buildbeat.js.

Settle these questions:
- Repository discovery: the main repository, plus every `repo:` target of
  the run configs under its delivery/work (resolved relative to the config
  file), plus direct child directories that are git repositories with a
  delivery/work; de-duplicated by real path; no recursion. A target that is
  missing, not a git repository, or whose config cannot be read produces
  one warning and never hides the other repositories or fails the command.
- Merge rule: a main-repository Work whose config targets another
  repository that has records for it appears exactly once, under that
  repository, with that repository's stage, runs, findings and decisions;
  its hints use the main repository's config path. Without records in the
  target it stays under the main repository with the run target noted.
- Every suggested command is runnable from the current directory (repository
  and config paths relative to it), including the pending-decision block.
- Settled works (CLOSED, CANCELLED, MERGED whose run config has no
  `release:` section) are counted per repository in text mode, listed in
  JSON; MERGED with a release section and not closed is listed.
- `--work` filters across repositories; `--run` with `--all-repos` is
  refused with a pointer to `--work`; the JSON shape matches work.md.
- Without `--all-repos`, only main-repository Works whose config targets
  another repository change; every other status output (text and JSON) of
  single repositories is unchanged.
- The whole command is read-only in every repository (no files, locks,
  compaction or ledger writes) and does not repeat expensive git calls per
  Work more than the single-repository status already does.
