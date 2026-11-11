# Example project

A fictional ledger project ("简账") as it looks after one piece of work went
through BuildBeat: the work's description, the review of its commit and the
owner's approval. The records under `delivery/work/` are what the runtime
wrote; the commits they name belong to the project's own history, which is
not shipped.

- `delivery/run-config.yaml`: how a commit of this project is verified
  (`npm test`) and reviewed (a read-only `codex exec`).
- `delivery/work/WORK-EXPORT-DATE-FILTER/`: `work.md`, the decisions, the
  reviewer's finding and the run record.

To try it, copy the folder, rename `gitignore.template` to `.gitignore`,
`git init`, commit, and follow the
[quickstart](../docs/v2/guide/01-quickstart.md). The example shows the
records; it does not prove what a real model can do.
