# Security and permission boundaries

[简体中文](09-security-boundaries.md) | **English**

Authority: [`RFC-0001 §Protected actions`](../RFC-0001-product-definition.md) (Chinese), [`V2-PLAN.md`](../../history/V2-PLAN.md) §9 invariants (Chinese). Design philosophy: **a protected action = a removed capability** — not "please, agent, don't", but making it impossible.

## Local boundaries on the Runner side (LOCAL_ENFORCED, all tested)

Each row has two columns: **what the kernel actually does**, and **what cannot be concluded from it**. The former has regression tests; the latter depends on the host's sandbox / container / server, and the Runner does not pretend otherwise.

| Boundary | What the kernel actually does (detection or removal) | What cannot be concluded from it |
|---|---|---|
| Push blocked | Worktree-level `remote.pushurl=protected://push-blocked-by-buildbeat` — inside the workspace, a worker's `git push` to a configured remote has nowhere to go (tested against a real remote) | That a worker cannot `git remote add` another remote, or make any network request |
| Write scope | An out-of-scope write under `allowedPaths` → no candidate pinned, `workspace.scope` BLOCK recorded, the Run stops — an out-of-scope change **cannot** become a qualifying candidate | That the worker process cannot touch host directories outside the worktree |
| Read-only reviewer | A before/after snapshot comparison per step; any write to the worktree is recorded as a failure (invariant 9) — this is **detecting and blocking the result after the fact**, not an operating-system write ban | That the write is stopped the moment it happens |
| Credential isolation | The worker env allowlist is by default only `PATH HOME LANG LC_ALL TMPDIR TERM USER SHELL`; cloud-credential / token **environment variables** in the host shell do not reach the subprocess; opening it explicitly with `inheritEnv: true` is labelled ADVISORY by doctor; `env:` injects only the variables you name (really passed through on the CLI loading path since 2.0.1; in 2.0.0 and earlier doctor and start disagreed, see the [Adapter guide](04-adapter-guide.en.md)) | That a worker cannot read credential files under `$HOME`, the keychain, ssh keys or other host resources (`HOME` is on the allowlist) |
| One active Run | By default a repository-wide lock, so a repository drives one Run at a time; Works whose run configs set `parallel: true` may run in parallel with each other, and Runs of the same Work stay mutually exclusive (since 3.2.0) | That concurrency across repositories / machines is coordinated |
| Control files | Workflow / policy / run configs live in the main checkout, outside the worker worktree's write scope | That a worker cannot read them by other means |
| No external actions in the kernel | Merge, push, deploy and publish have **no call path** in the Runner (invariant 20, printed by doctor); at most the Runner puts "the candidate is fit to merge" in the inbox | That any external worker command you configure cannot do these things in every host environment |

In one sentence: **the kernel guarantees that an out-of-bounds result cannot enter the ledger, become a candidate or get stamped**; "the worker cannot do it in the first place" depends on the sandbox the host gives it (a tool allowlist, egress limits, no production credentials).

## Preconditions for running unattended (the stance enforced since the MVP)

Prompt injection is a first-class attack surface: an unattended worker consumes any file in the repository. An unattended run must satisfy all three layers at once; missing any layer downgrades it to attended (a human in the loop):

| Layer | Who guarantees it | What |
|---|---|---|
| Kernel | The Runner (the section above) | Push blocked, write scope, read-only reviewer, env allowlist, no call path for external actions |
| Host | Your worker sandbox / container / the tool's own permission mode (such as `codex exec -s read-only`) | A tool allowlist, egress limits, **no production credentials** — the kernel does not and cannot check this layer; doctor reports only the env posture |
| Server | Code hosting / CI / deployment platform | Branch protection, required CI, deployment approval (next section) |

observe's diagnose commands follow the same discipline: read-only, same env allowlist.

## SERVER_ENFORCED is an honest declaration

Branch protection, required CI and deployment approval are enforced by the server; marking a policy `SERVER_ENFORCED` says "this gate lives on the server", and the Runner records it without pretending it can guarantee it locally. Never mark as LOCAL what cannot be stopped locally.

## Credential red line (operations)

Credentials for publishing / deploying are read only at run time (for example from the macOS Keychain), never written to files, logs or Git; `doctor` checks the adapter's env posture. A configuration that breaks the red line should not pass review.
