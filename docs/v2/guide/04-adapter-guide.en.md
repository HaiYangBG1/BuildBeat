# Connecting the verification command and the review tool

[简体中文](04-adapter-guide.md)

The verifier and the reviewer are each one command in the config, run in a temporary checkout of the commit. The model, authentication and capability come from the tool you use. The shipped `templates/v2/envelope/worker.sh` passes the prompt to the review tool as the last argument and hands its output back; to change tools, change only the command after `--`.

What the runtime gives a command:

- `BUILDBEAT_INPUT`: JSON with the work id, the step, the path and digest of the work description (`workArtifact`), the starting commit (`base`), the commit reviewed last time and earlier rulings.
- `BUILDBEAT_PROMPT`: this round's prompt file (reviewer only).
- `BUILDBEAT_OUTPUT`: the reviewer writes its report here.
- `BUILDBEAT_SCREENSHOT_DIR`: the directory the verification command writes screenshots to (when screenshots are configured).

For the verifier only the exit code and the log count: 0 is a pass, 75 means the environment is not ready, any other nonzero code means this commit failed.

By default the environment carries only `PATH HOME LANG LC_ALL TMPDIR TERM USER SHELL`; `env` lists the extra variables to pass in, and `inheritEnv: true` inherits everything. `check` prints the environment each command actually gets. Files under HOME are outside this isolation.

A timeout, a crash, an unreadable report and exit 75 are all recorded as tool trouble, and the round is `CANCELLED`.

Which tools really work has to be verified for each one; a scripted reviewer only proves that the flow connects, not what a real model can do.
