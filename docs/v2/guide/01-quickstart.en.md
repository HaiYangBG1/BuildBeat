# Quickstart

Install the runtime: `npm install --global @haiyangbg/buildbeat@latest` (Node ≥ 20). Upgrading from a version before 6: finish or cancel work in progress with the old version first. Records left by old versions need no change; closed works show as before, and an unclosed work in the old format shows as `LEGACY`.

1. Check Node ≥20, Git, Bash and an authenticated AI tool. Keep project-owned instructions.
2. The templates ship with the npm package under `$(npm root -g)/@haiyangbg/buildbeat/templates/`. Install `v2/AGENTS.md` and `v2/CLAUDE.md` according to the tool's loading rules; copy runtime exclusions from `gitignore.template` (in `templates/`, not in `v2/`). `delivery/` goes into Git with the code; do not exclude it in `.gitignore` or `.git/info/exclude`. Screenshots, archives and logs under it stay out of Git; the template already has the rules.
3. Copy `v2/run-config.example.yaml` to `delivery/run-config.yaml` and `v2/envelope/` to `delivery/envelope/`, replace the verification and review commands with real ones, and commit. This config says how a commit is verified and reviewed in this project; every work shares it. `buildbeat check --repo .` checks that it is written correctly.
4. Create delivery/work/WORK-X/work.md following the eight sections of `v2/work.example.md`: goal, why now, facts checked (the commit checked on in its heading, each fact with its source, code as `path:<start>-<end>`), scope, decisions before starting, acceptance, implementation plan and stop conditions. Headings may be in the project's own language. Commit it: only changes after this commit count as this work's.
5. After the user accepts the work, the session writes the code, commits it, and sends the commit for review. A review runs the verification in a temporary checkout of that commit, has a read-only reviewer look at it, and stops at the human decision. An approval names the full commit. After the merge (and a passing readback when the work declares a release), write delivery/work/WORK-X/result.md from `v2/result.example.md`, then close the work with the last command.

```bash
buildbeat accept --repo . --work WORK-X --as human --by owner
buildbeat check --repo . --work WORK-X
buildbeat review --repo . --work WORK-X
buildbeat status --repo . --work WORK-X
buildbeat decide --repo . --work WORK-X --action approve --candidate <full SHA> --as human --by owner
buildbeat decide --repo . --work WORK-X --action close --as human --by owner
```

The project config needs at least these two entries:

```yaml
workers:
  # The real test command; exit 75 when the environment is not ready (tool trouble, not a verdict on the commit)
  verifier:
    command: bash
    args:
      - -lc
      - npm test
  # Read-only review. To change tools, change only the command after `--`
  reviewer:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - reviewer
      - --
      - codex
      - exec
      - -s
      - read-only
envelope:
  prompts: envelope/prompts
```

The sample also has `requires` (environment checks before a review), `redact` (masking in evidence), `requireScreenshot` (projects with a UI), `release` (the readback command) and `maxReviewSeverity`. When one work must differ from the project, write only the keys to override in `delivery/work/WORK-X/run-config.yaml`; that file also takes `allowedPaths` (the directories this work may change) and `base` (the commit the work starts from). An unknown key is an error.

A review ends in one of three ways. `FAILED`: the verification failed or the commit changed a directory out of scope; fix and send again. `CANCELLED`: a tool had trouble, which is not a verdict on the commit; send again when the environment is back. Waiting for the human decision: an approval is refused while a P0 or P1 finding is undecided. Fix in a new commit and send it; the earlier round is superseded.

[Worker contract](05-worker-contract.en.md) · [Recovery](10-recovery.en.md)

For a main repository with code repositories, use `buildbeat status --repo . --all-repos` for pending decisions and open work across repositories; add `--work <ID>` or `--json` as needed. See [Session handoff](11-session-handoff.en.md).
