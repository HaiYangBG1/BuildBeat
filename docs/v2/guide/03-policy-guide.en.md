# Built-in delivery checks

[简体中文](03-policy-guide.md)

New runs use fixed checks: the work artifact is accepted at its current digest, and the final candidate has command evidence and an independent review. Missing or unverified facts never pass. The custom rule language, arbitrary hook points and UI-specific policies are retired.

Safeguards are frozen in RUN_CREATED. Resume rejects changes. Approval reads the frozen checks even without a configuration argument. Editing the work artifact invalidates its acceptance and cannot reuse an earlier run approval.

Legacy fast/standard/controlled names only translate to the same acceptance and severity requirements. In particular, controlled's P3 floor cannot be weakened to P2. New projects use explicit options instead of profiles.

Project-specific security, interface, UI and release requirements belong in project instructions and real verification commands. Branch protection and host isolation remain the responsibility of their platforms.
