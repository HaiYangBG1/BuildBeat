# Security boundaries

[简体中文](09-security-boundaries.md)

| Mechanism | Actual boundary |
|---|---|
| worktree | Separate candidate directory and branch; not an OS sandbox |
| allowedPaths | Out-of-scope results cannot become qualified candidates; not filesystem access control |
| read-only review | Compare Git state and reject changed results; not host write prevention |
| push restriction | Override configured remote push URLs in the worktree; not a network sandbox |
| env allowlist | Limit inherited variables; HOME files, keychains and SSH files remain outside it |
| approval and evidence | Bind current candidate, work digest, evidence and frozen safeguards |
| concurrency locks | Local repository coordination with per-Work exclusion; no cross-machine scheduler |

Host sandboxing, production credential isolation and server branch protection need their respective platforms. The runner has no merge/push/deploy/publish call path, but arbitrary external workers still have their actual host permissions.

BuildBeat does not collect or upload project usage data. Configured AI tools and notification services have their own data handling.
