# Adapter guide

[简体中文](04-adapter-guide.md) | **English**

Authority: [`RFC-0002 §Adapter`](../RFC-0002-domain-model.md) (Chinese); implementation: `src/v2/adapters/shell.js` (production), `src/v2/adapters/mock.js` (tests). Ruling #5: vendor-neutral — not tied to any agent vendor.

## Shell adapter: every CLI is a worker

`workers.<role>` in the run config is exactly one shell adapter configuration:

```yaml
workers:
  builder:
    command: codex
    args:
      - exec
      - -s
      - workspace-write
      - <a prompt or script arguments>
    timeoutMs: 900000
```

- The working directory is the step's isolated worktree (not the main checkout);
- `args` support templates: `{workspace}` `{step}` `{worker}`;
- Proven workers: `codex exec` (four real M4 pilots) and any bash script; `claude -p` has the same shape and can be swapped in.

## Env allowlist (the default; part of removing capabilities)

A worker subprocess receives **only** `PATH HOME LANG LC_ALL TMPDIR TERM USER SHELL` by default — cloud credentials and token **environment variables** in the host shell cannot reach the worker (note that `HOME` is on the allowlist: credential **files** are outside this boundary; see [Security boundaries](09-security-boundaries.en.md)). `inheritEnv: true` opens it explicitly (doctor labels that isolation as ADVISORY only); single variables can be injected allowlist-style with `env:`:

```yaml
workers:
  verifier:
    command: bash
    env:
      DATABASE_URL: postgres://localhost/app_test
      CI: "1"
    args:
      - -lc
      - npm test
```

Values in `env:` must be scalars (turned into strings before they reach the subprocess) and variable names must be valid (letters, digits, underscore); otherwise `doctor` / `start` report an error while loading the config. **The CLI loading path of 2.0.0 and earlier dropped these two fields** (doctor reported the posture, but start ran with the default allowlist, and `env:` variables never reached the worker); since 2.0.1 they are passed through, with a CLI end-to-end regression (`tests/v2-run-cli.test.js`). API users who call `createShellAdapter` directly were not affected.

## Input and output

- Input: the `BUILDBEAT_INPUT` environment variable carries JSON (step / worker / candidate / failure summary and so on, per role; see the [Worker contract](05-worker-contract.en.md));
- Output: a step that needs a structured result (the reviewer and others) writes a JSON envelope to the path in `BUILDBEAT_OUTPUT`; codex can also write its last message with `-o` and have a wrapper script convert it;
- A pure command step (the verifier running tests) needs no envelope — the Runner reads back the exit code and logs as evidence.

## Result semantics

An adapter only reports facts: exitCode / signal / timedOut / spawnError / stdout / stderr / start and end time. The orchestrator writes the events; an adapter never touches kernel state. A timeout, a crash and a failure to start are recorded as `timeout` / `crashed` / the failure path respectively, each with an end-to-end test (`tests/v2-invariants.test.js`).

## Mock adapter

`createMockAdapter(script)`: gives each step a sequence of `"succeed"` / `"fail"` or `{behavior, envelope}`, for tests and evals; the behaviour cards are in [`evals/`](../../../evals/README.md).

## When to write a dedicated adapter

Only when the shell cannot express it (streaming interaction, a kept session) do you write a dedicated adapter; per the M3 ruling, connect everything through the shell first, and revisit only when a real pilot proves it is not enough.

## Live output

> Since 2.0.0-beta.4 (iteration 08).
When the orchestrator passes `liveDir` to the shell adapter, the subprocess's stdout/stderr are written straight to `<liveDir>/<step>-<attempt>.{stdout,stderr}.live` (the fds directly, without buffering in the parent), along with `live.json` (`step / attempt / worker / command / startedAt`). When the step returns, the adapter reads both streams back as `stdout` / `stderr` and deletes the live files — the result shape is unchanged and the evidence collector works as before. A custom adapter that wants `status` to show "last output N minutes ago" just produces files with the same names; without them `status` shows only the elapsed time.
