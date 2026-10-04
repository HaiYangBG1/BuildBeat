# Evidence and efficiency readings

[简体中文](06-evidence-guide.md)

Evidence is read from Git and actual execution: kind, candidate, log digest, outcome, grade, producer and timestamps. Passed, failed and unverified remain distinct. Evidence for an old candidate cannot approve a new one.

Historical L0–L4 grades remain readable; command evidence defaults to L2. A grade label does not prove production acceptance. Production observation is outside this product; release readback after the merge is described in [Work acceptance and decisions](07-approval-guide.en.md).

For UI delivery, set `requireScreenshot: true` in the run config. While verify runs, the environment variable `BUILDBEAT_SCREENSHOT_DIR` names a fresh empty directory outside the worktree; verify writes screenshots of the real render there as PNG, and each becomes screenshot evidence bound to the current candidate by its file digest. Only decodable PNG regular files count: the chunk layout (one IHDR first, the palette before the pixel data, consecutive IDAT, IEND last, no unknown critical chunk) with every CRC, a legal size, bit depth and palette, and pixel data that reconstructs row by row (interlaced images included) with palette indices inside the palette. Empty, truncated or symlinked files and other formats such as jpg or webp are rejected with the reason named, even when another screenshot of the same verify passes. A cached verify and an approval re-check the files under the same rules (JPEG and WebP cannot be checked to the point of decoding without a dependency; headless browser screenshots are PNG by default). This proves a decodable image, not the right page, which the reviewer and the person deciding judge. A verify that succeeds without a screenshot counts as failed; the merge check uses the screenshots of the current candidate's latest passed verify and re-checks their file digests; reviewer input, the decision card and notifications list their paths and digests. The switch is frozen with the run, and a cached verify carries its source screenshots.

Raw logs live in .buildbeat/runtime/. Terminal run records, work decisions and adjudications live under delivery/work/. A digest is not a raw-log backup; retain logs according to project needs.

Status includes costs, evidence completeness, approval waits, repair counts and durations. These are local derived readings, not token or monetary bills. Cached verification identifies its source and only reuses passed evidence with matching tree, command and envelope. Disable it for externally changing checks.

check --step creates no formal run evidence; the run must reproduce it. Live output and elapsed time are not acceptance verdicts. Compare completion duration, human interventions, repeated work and recovery outcomes; scripted regressions do not establish real AI speed.
