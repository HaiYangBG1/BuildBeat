# Connecting the verification command and the review tool

[简体中文](04-adapter-guide.md)

The verifier and the reviewer are each one command in the config, run in a temporary checkout of the commit. The model, authentication and capability come from the tool you use. The shipped `templates/envelope/worker.sh` passes the prompt to the review tool as the last argument and hands its output back; to change tools, change only the command after `--`.

What the runtime gives a command:

- `BUILDBEAT_INPUT`: JSON with the work id, the step, the path and digest of the work description (`workArtifact`), the starting commit (`base`), the commit reviewed last time and earlier rulings.
- `BUILDBEAT_PROMPT`: this round's prompt file (reviewer only).
- `BUILDBEAT_OUTPUT`: the reviewer writes its report here.
- `BUILDBEAT_SCREENSHOT_DIR`: the directory the verification command writes screenshots to (when screenshots are configured).

For the verifier only the exit code and the log count: 0 is a pass, 75 means the environment is not ready, any other nonzero code means this commit failed.

By default the environment carries only `PATH HOME LANG LC_ALL TMPDIR TERM USER SHELL`; `env` lists the extra variables to pass in, and `inheritEnv: true` inherits everything. `check` prints the environment each command actually gets. Files under HOME are outside this isolation.

A timeout, a crash, an unreadable report and exit 75 are all recorded as tool trouble, and the round is `CANCELLED`.

Which tools really work has to be verified for each one; a scripted reviewer only proves that the flow connects, not what a real model can do.

## Only one AI tool, or no review yet

A review needs a separate read-only session that did not write the code, not a product from another vendor. The tool you already use, run once headless, is a new session and can be the reviewer.

**No review yet is fine.** Leave `workers.reviewer` out of the config and `buildbeat review` runs only the verification, then stops for the person's decision as usual; approving works as usual. The round records the verify-only flow (`verify-only`); the review output, `status`, the approval and `history --path` all say "verified, not reviewed", so it is never shown as reviewed. Add `workers.reviewer` when you want reviews.

**Setting up any tool as the reviewer:**

1. Find its command-line program. Some tools ship it inside the desktop app, off PATH (WorkBuddy has it at `/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy`); write the full path in the config. If the command line needs its own sign-in, sign in once in a terminal.
2. Read its `--help` for two things: running headless (often `-p`, `--print` or `exec`) and a read-only switch, or a way to allow only commands that look. `worker.sh` passes the prompt as the last argument, so the tool must read its prompt from there.
3. Put it in `workers.reviewer`, changing only what follows `--`, then run `buildbeat check --repo .`: a tool it cannot find is reported.
4. Send one review and see that a report comes back. No report, an unreadable one, or a changed file makes the round `CANCELLED`; it never counts as reviewed.

Some common forms; each tool's current `--help` is what counts:

| Tool | After `--` | Tested |
|---|---|---|
| Codex | `codex exec -s read-only` | used by this repository |
| Claude Code | `claude -p --tools Read,Grep,Glob,Bash --allowedTools Read Grep Glob "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)" "Bash(printenv:*)" --permission-mode dontAsk` | not tested |
| WorkBuddy | its bundled `codebuddy` (full path above), with the Claude Code arguments | not tested |
| Cursor | `cursor-agent -p --mode ask` | not tested |
| Gemini CLI | `gemini --approval-mode plan -p` | not tested |

In YAML each argument goes on its own line; the Claude Code row becomes:

```yaml
  reviewer:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - reviewer
      - --
      - claude
      - -p
      - --tools
      - Read,Grep,Glob,Bash
      - --allowedTools
      - Read
      - Grep
      - Glob
      - Bash(git diff:*)
      - Bash(git log:*)
      - Bash(git show:*)
      - Bash(printenv:*)
      - --permission-mode
      - dontAsk
```

**What reviewing with the same tool gives up:** it is still a new context, read-only, after real verification commands; but the same model wrote and reviewed the change, so its blind spots are more likely to overlap. With two tools, have the other one review. When a tool has no read-only switch, the runtime only catches a changed file (the round is void); it cannot stop the tool reading other files on the machine.

**A tool with no headless command line** (only a chat panel in an editor): verify without review, or use [Skill and project files only](12-without-runtime.en.md). Neither may be described as an independent review.
