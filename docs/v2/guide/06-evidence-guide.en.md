# Evidence and efficiency readings

[简体中文](06-evidence-guide.md)

Evidence is read from Git and actual execution: kind, candidate, log digest, outcome, grade, producer and timestamps. Passed, failed and unverified remain distinct. Evidence for an old candidate cannot approve a new one.

Historical L0–L4 grades remain readable; command evidence defaults to L2. A grade label does not prove production acceptance. Production observation and release readback execution are outside this product.

Raw logs live in .buildbeat/runtime/. Terminal run records, work decisions and adjudications live under delivery/work/. A digest is not a raw-log backup; retain logs according to project needs.

Status includes costs, evidence completeness, approval waits, repair counts and durations. These are local derived readings, not token or monetary bills. Cached verification identifies its source and only reuses passed evidence with matching tree, command and envelope. Disable it for externally changing checks.

check --step creates no formal run evidence; the run must reproduce it. Live output and elapsed time are not acceptance verdicts. Compare completion duration, human interventions, repeated work and recovery outcomes; scripted regressions do not establish real AI speed.
