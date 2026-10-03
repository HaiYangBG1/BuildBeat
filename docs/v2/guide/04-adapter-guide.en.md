# Worker integration

[简体中文](04-adapter-guide.md)

The Shell Adapter runs a configured AI CLI or script in the isolated worktree. The chosen tool owns its model, authentication and business capability. Recorded real AI worker evidence covers codex exec; other tools need their own validation.

BUILDBEAT_INPUT carries work/step context, and BUILDBEAT_PROMPT points to the materialized prompt. Structured steps write BUILDBEAT_OUTPUT. The runner reads verifier exit codes and logs. The shipped worker.sh handles arguments, commits and envelopes.

The default environment allowlist is PATH HOME LANG LC_ALL TMPDIR TERM USER SHELL. env injects named values; inheritEnv explicitly enables inheritance. Files under HOME are outside this boundary.

Timeouts, crashes, invalid JSON and exit 75 are infrastructure failures: stop for a human without dispatching a fixer. Ordinary nonzero exits are candidate failures. Live stdout/stderr supports status and becomes evidence logs when the step finishes.

The Mock Adapter validates deterministic protocol behavior, not real model capability.
