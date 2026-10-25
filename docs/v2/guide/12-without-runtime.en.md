# Taking part without the runtime

[简体中文](12-without-runtime.md)

People and AI tools without the `buildbeat` runtime (a machine without Node, a web AI chat, a locked-down company computer) can still take part through the project files. They have no automatic loop, isolated worktree, approval checks, budgets or recovery, and must not claim them.

## What you can read

| File (under `delivery/work/<ID>/`) | Content |
|---|---|
| `work.md` | Goal, why now, facts checked, scope, decisions before starting, acceptance, implementation plan, stop conditions |
| `decisions.jsonl` | Acceptances, approvals, closures; one JSON object per line |
| `review-findings.jsonl` | Review findings and human verdicts |
| `runs/<RUN>/run-record.json` | Terminal state, candidate, evidence digests and cost of finished runs |
| `releases.jsonl` | Release readbacks after the merge |
| `result.md` | Written at closing: what was delivered, what was decided, what is left, what was written into the project's documents |

The ledger of a run in progress lives in `.buildbeat/runtime/` on the machine running it and is not in Git; that side's `buildbeat status` is authoritative for progress.

## What you can write

- **Draft or edit `work.md`.** An edit invalidates the existing acceptance; the runtime shows it as awaiting acceptance or stale.
- **Accept `work.md` as the work owner:** append a line to `decisions.jsonl`. `digest` is the SHA-256 of the `work.md` file content (for example `shasum -a 256 work.md`); `decisionRef` is `A-<ID>-<current line count + 1>`:

  ```json
  {"ts":"2026-10-04T08:00:00.000Z","decisionRef":"A-WORK-X-1","decision":"approved","transition":"accept-work","subject":{"artifact":"work","digest":"sha256:<64 hex digits>"},"by":"<name>","actor":{"kind":"human","id":"<name>","source":"flag"}}
  ```

- **Rule on a recorded review finding:** append a line to `review-findings.jsonl`. `fingerprint` must be an existing finding's fingerprint; `action` is `accept` or `dismiss`:

  ```json
  {"ts":"2026-10-04T08:00:00.000Z","kind":"adjudication","fingerprint":"<fingerprint>","action":"dismiss","by":"<name>","actor":{"kind":"human","id":"<name>","source":"flag"},"note":"<reason>"}
  ```

- **Write `result.md`** from `templates/v2/result.example.md`. Conclusions that later work needs go into the project's own documents first and are committed (the commit must already be on the main branch); result.md then records each one as `- <path> @ <commit> — <what was written>`.

- **Close a Work that needs no release** (for example a documentation change): once `result.md` is written, append `{"ts":"2026-10-04T09:00:00.000Z","decision":"closed","transition":"close-work","subject":{"result":"<outcome>","resultDigest":"sha256:<64 hex digits>","promotions":[]},"by":"<name>","actor":{"kind":"human","id":"<name>","source":"flag"}}`. `resultDigest` is the SHA-256 of the `result.md` file content (for example `shasum -a 256 result.md`); `promotions` lists each promotion line of result.md as `{"path":"<path>","commit":"<full commit hash>"}`, or `[]` when there is none. A Work that is released closes through the runtime's `release` and `decide --action close`, which bind the closure to a readback.

- **Write relation lines** in a `work.md` you are drafting (before acceptance) or in `result.md`, one per line: `- follows: <id>`, `- split from: <id>`, `- related: <id>`, `- ref: <external id>`. They are plain text; someone with the runtime sees the linked works strung into one thread with `status --work`.

- **Write the facts section** with the commit you checked on in its heading and code pointed at as `path:<start>-<end>` in backticks. This is plain text too; without the runtime, `git diff <that commit> HEAD -- <path>` shows whether the code changed. Someone with the runtime sees what changed in `status --work`.

- **When you commit code or documents for a work**, end the commit message with a blank line and `Work: <ID>`. Someone with the runtime can then find the work from the code with `buildbeat history --path`.

`actor` says truthfully who decided: a person writes `"kind":"human"`; an AI tool deciding on its own writes `"kind":"agent"` with the tool's name as `id`; an AI tool passing on what a person said in the conversation writes the person's name with `"kind":"human"` and adds `"via":"agent-session"`. Older lines with `by` and no `actor` stay valid; status shows them as "identity not recorded".

Each line must be one complete JSON object; only append, never edit earlier lines. Commit the files and hand them to someone with the runtime. `delivery/` belongs in Git: do not exclude it in `.gitignore` or `.git/info/exclude`.

## What you must not do

- Approve or reject a run, or adopt a candidate: the runtime records these in the run ledger and re-reads the candidate and evidence before stamping.
- Write or edit a run ledger, `run-record.json`, `releases.jsonl` or any evidence; claim that verification, review, a release readback or the promotion check has passed.
- Record a decision in someone else's name, or edit existing lines.

## Handing over to someone with the runtime

After pulling the commit they run `buildbeat status --repo . --work <ID>`: a changed `work.md` shows as awaiting acceptance, and hand-written acceptance and adjudication lines take effect under the same digest and fingerprint rules; the promotion lines in `result.md` are checked live (✓/✗), and a `result.md` changed after the close is flagged. `buildbeat run --config <config>` then continues delivery.
