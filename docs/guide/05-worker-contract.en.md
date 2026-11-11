# The reviewer and verifier contract

[简体中文](05-worker-contract.md)

The verifier runs the project's real acceptance command. It does not change files or move HEAD; when the checkout is not clean or HEAD has changed after the verification, the round is recorded as `FAILED`.

The reviewer is independent and read-only, and looks at one fixed commit. When it changes files in the checkout, the round is recorded as `CANCELLED` and the report is void.

The review report goes into `$BUILDBEAT_OUTPUT`: `{"status":"succeeded","findings":[{"severity": "P1", "summary": "specific issue"}]}`. severity is P0–P3 and summary is a string; `P0` / `P1` block an approval. A review with no findings still hands in `{"findings": []}`. A report wrapped in a json code block is accepted.

An unreadable report, a finding without severity, or an exit 0 with no report written (printing it to stdout does not count) is recorded as `invalid-output`. That is tool trouble, and it is no ground for asking for a code change.

The reviewer's input has the work description (`workArtifact`: the path in the repository and the accepted digest), the starting commit, the commit reviewed last time and earlier rulings. Prompts may use them; the reviewer cannot approve on its own.

When the environment lacks a tool, the backend is unavailable or the sandbox forbids a necessary operation, use exit 75; do not hide an environment problem by changing code. Do not print credentials in logs. The runtime reads back the commit, the exit code and the evidence itself; a self-report does not replace facts.
