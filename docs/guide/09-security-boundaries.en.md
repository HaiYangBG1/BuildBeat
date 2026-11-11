# Security boundaries

[简体中文](09-security-boundaries.md)

| Mechanism | Actual boundary |
|---|---|
| Temporary checkout | Verification and review run in a separate checkout of the commit; it is not an operating system sandbox |
| allowedPaths | A commit that changed a directory out of scope is recorded as failed; it is not a filesystem write ban in advance |
| Read-only review | Git state is compared before and after the review, and a review that changed files is void; it is not a host write permission |
| Push restriction | The pushurl of the remotes in the checkout is removed; this does not guarantee a command cannot add a remote or reach the network |
| env allowlist | Limits the inherited environment variables; it does not isolate files under HOME, the keychain or SSH files |
| Approval and evidence | An approval goes through only when the commit, the work description digest and the evidence all match |
| Decision identity | Records whether a decision came from a person or an AI session; without `--as` it goes by the AI tools' environment markers. This is a default, not forgery protection: an AI session can still pass `--as human` or clear the environment variables |
| Lock | One repository runs one review round at a time, relying on a lock on this machine; there is no coordination across machines |

Host sandboxing, production credential isolation and server-side branch protection have to be provided by their platforms. The runtime has no call path for merge, push, deploy or publish, but any command you configure is still bound by the actual permissions of the host.

BuildBeat does not collect or upload the project's usage data; the AI tool you configure has its own way of handling data.
