# BuildBeat capability matrix / 能力矩阵

Current release: 4.2.2. One product path: Skill → local runtime →
project records. The Claude Code plugin distributes the Skill and references;
install the runtime separately. Files remain readable without the runtime, but
manual work has no automatic loop, isolation, budget or approval enforcement;
[Taking part without the runtime](v2/guide/12-without-runtime.en.md) states what
may be written by hand.

| Capability | Current implementation | Boundary |
|---|---|---|
| Work context | work.md, accepted digest, decisions, candidate and evidence | Chat discussions must be saved explicitly |
| Delivery loop | Fixed build/verify/review/fix flow | External CLI tools do the actual work |
| Recovery | Run/step ledger, resume, manual candidate adoption, stale locks | Active runtime is not transferred by Git clone |
| Trusted result | Real command evidence, current candidate, read-only review | Script tests do not prove real AI business capability |
| Decisions | Acceptance, exact approval bound to the candidate, frozen checks, budget/convergence stops, repairs at the merge decision (adopt a hand fix or send it back to the fixer) | No automatic merge, push or deployment |
| Efficiency | Verify cache, review range hints, parallel Work isolation | External test state must be isolated and stable |
| Feedback | Unified status/cost/decisions, also across a main repository and its code repositories (`--all-repos`), liveness, webhook/DingTalk | Notifications do not approve |
| UI evidence | `requireScreenshot`: screenshots from verify, bound to the candidate and required at merge | The project's verify renders and captures |
| Release closeout | `release` records the project's readback in the Work; `decide --action close` on a passing readback | No deployment; observation stays with project monitoring |
| Maintenance | Check, history/replay, safe gc | Not a production monitoring service |

The runtime has no account service, telemetry, remote project database, hosted
agents or built-in model. Recorded real AI-worker evidence covers codex exec;
other CLI integrations require their own validation.

Production observation, the release-readback lane, UI policy files, custom rule
languages and the shipped governance templates are retired; the release
closeout and the screenshot switch above cover the release and UI cases. [Migration](MIGRATION.md) preserves the old-record and
active-run boundary. [Guides](v2/guide/README.md) describe current usage.
