# Evidence and efficiency readings

[简体中文](06-evidence-guide.md)

Evidence is read from Git and actual execution: kind, candidate, log digest, outcome, grade, producer and timestamps. Passed, failed and unverified remain distinct. Evidence for an old candidate cannot approve a new one.

Historical L0–L4 grades remain readable; command evidence defaults to L2. A grade label does not prove production acceptance. Production observation is outside this product; release readback after the merge is described in [Work acceptance and decisions](07-approval-guide.en.md).

For UI delivery, set `requireScreenshot: true` in the run config. While verify runs, the environment variable `BUILDBEAT_SCREENSHOT_DIR` names a fresh empty directory outside the worktree; verify writes screenshots of the real render (png, jpg, jpeg, webp) there, and each becomes screenshot evidence bound to the current candidate by its file digest. A verify that succeeds without a screenshot counts as failed; the merge check requires screenshots for the current candidate; reviewer input, the decision card and notifications list their paths and digests. The switch is frozen with the run, and a cached verify carries its source screenshots.

Raw logs live in .buildbeat/runtime/. Terminal run records, work decisions and adjudications live under delivery/work/. A digest is not a raw-log backup; retain logs according to project needs.

Status includes costs, evidence completeness, approval waits, repair counts and durations. These are local derived readings, not token or monetary bills. Cached verification identifies its source and only reuses passed evidence with matching tree, command and envelope. Disable it for externally changing checks.

check --step creates no formal run evidence; the run must reproduce it. Live output and elapsed time are not acceptance verdicts. Compare completion duration, human interventions, repeated work and recovery outcomes; scripted regressions do not establish real AI speed.
