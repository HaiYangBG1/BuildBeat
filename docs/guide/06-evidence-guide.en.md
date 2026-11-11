# Evidence

[简体中文](06-evidence-guide.md)

Evidence comes from Git and real execution: kind, commit, log digest, outcome, producer, and start and end time. Passed, failed and unverified are recorded apart; one commit's evidence cannot let another commit through.

The evidence grade of a verification command is recorded as L2. A grade does not prove production readiness; whether production is fine is a matter for the [release readback](07-approval-guide.en.md).

## Screenshots

A project with a UI writes `requireScreenshot: true` in its config. While the verification runs, `BUILDBEAT_SCREENSHOT_DIR` points at a new empty directory outside the checkout; the verification command writes screenshots of the real render there as PNG, and each is recorded as evidence bound to this commit (by file digest).

Only decodable PNG regular files are accepted: the runtime checks the chunk layout and checksums, the size, bit depth and palette, and the ancillary chunks that affect decoding, and it inflates the pixel data to check it (up to 256 MiB per image). Empty files, truncated files, symlinks and other formats such as jpg and webp are rejected with the reason written down, and that is recorded even when another screenshot from the same verification passes. An approval re-checks the files under the same rules.

This proves the image decodes, not that the screen is right; the reviewer and the person deciding judge the screen. A verification that passes without a screenshot makes the round a failure.

## Where it is stored

Raw logs are in `.buildbeat/runtime/` and are not in Git. The record of each finished round (`runs/<RUN>/run-record.json`), the decisions (`decisions.jsonl`) and the review findings and rulings (`review-findings.jsonl`) are in `delivery/work/<ID>/` and go into Git with the code. The records hold digests, not a backup of the raw logs; keep raw logs as the project itself requires.

The cost line of `status --work <ID>` is `cost: review rounds <n> · findings <m>`: how many rounds this work was reviewed and how many findings were raised. It is counted from the records and is not a token or money bill.
