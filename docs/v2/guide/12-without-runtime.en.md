# Taking part without the runtime

[简体中文](12-without-runtime.md)

People and AI tools without the `buildbeat` runtime (a machine without Node, a web AI chat, a locked-down company computer) can still take part through the project files. They have no automatic loop, isolated worktree, approval checks, budgets or recovery, and must not claim them.

## What you can read

| File (under `delivery/work/<ID>/`) | Content |
|---|---|
| `work.md` | Goal, scope, acceptance, implementation plan |
| `decisions.jsonl` | Acceptances, approvals, closures; one JSON object per line |
| `review-findings.jsonl` | Review findings and human verdicts |
| `runs/<RUN>/run-record.json` | Terminal state, candidate, evidence digests and cost of finished runs |
| `releases.jsonl` | Release readbacks after the merge |

The ledger of a run in progress lives in `.buildbeat/runtime/` on the machine running it and is not in Git; that side's `buildbeat status` is authoritative for progress.

## What you can write

- **Draft or edit `work.md`.** An edit invalidates the existing acceptance; the runtime shows it as awaiting acceptance or stale.
- **Accept `work.md` as the work owner:** append a line to `decisions.jsonl`. `digest` is the SHA-256 of the `work.md` file content (for example `shasum -a 256 work.md`); `decisionRef` is `A-<ID>-<current line count + 1>`:

  ```json
  {"ts":"2026-10-04T08:00:00.000Z","decisionRef":"A-WORK-X-1","decision":"approved","transition":"accept-work","subject":{"artifact":"work","digest":"sha256:<64 hex digits>"},"by":"<name>"}
  ```

- **Rule on a recorded review finding:** append a line to `review-findings.jsonl`. `fingerprint` must be an existing finding's fingerprint; `action` is `accept` or `dismiss`:

  ```json
  {"ts":"2026-10-04T08:00:00.000Z","kind":"adjudication","fingerprint":"<fingerprint>","action":"dismiss","by":"<name>","note":"<reason>"}
  ```

- **Close a Work that needs no release** (for example a documentation change): append `{"ts":"2026-10-04T09:00:00.000Z","decision":"closed","transition":"close-work","subject":{"result":"<outcome>"},"by":"<name>"}`. A Work that is released closes through the runtime's `release` and `decide --action close`, which bind the closure to a readback.

Each line must be one complete JSON object; only append, never edit earlier lines. Commit the files and hand them to someone with the runtime.

## What you must not do

- Approve or reject a run, or adopt a candidate: the runtime records these in the run ledger and re-reads the candidate and evidence before stamping.
- Write or edit a run ledger, `run-record.json`, `releases.jsonl` or any evidence; claim that verification, review or a release readback has passed.
- Record a decision in someone else's name, or edit existing lines.

## Handing over to someone with the runtime

After pulling the commit they run `buildbeat status --repo . --work <ID>`: a changed `work.md` shows as awaiting acceptance, and hand-written acceptance and adjudication lines take effect under the same digest and fingerprint rules. `buildbeat run --config <config>` then continues delivery.
