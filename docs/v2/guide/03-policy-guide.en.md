# What is checked before an approval

[简体中文](03-policy-guide.md)

Before approving a commit, the runtime always checks these things. They cannot be configured to be looser:

- The work description has been accepted, and what was accepted is the work.md in this commit. Once work.md changes, the earlier acceptance no longer holds and it must be accepted again.
- This commit has passing verification evidence, produced by the runtime's own run.
- The review was done on this commit, and no serious finding is undecided (P0 and P1 by default; with `maxReviewSeverity: P3`, P2 counts too).
- With `requireScreenshot: true` configured, this commit has screenshots left by the verification.
- The full commit hash in the approval command is the commit waiting for a decision.

When any of these is missing or cannot be checked, the approval is refused and says what is missing. The check conditions are recorded into the round when the commit is sent for review; a later config change does not affect a round already sent.

The project's security, interface, UI and release requirements belong in the project's rules and in real verification commands. Server-side branch protection and host isolation are the responsibility of their own platforms.
