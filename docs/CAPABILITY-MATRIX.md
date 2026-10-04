# BuildBeat capability matrix / 能力矩阵

Current source: unreleased 4.0.0-dev.0. One product path: Skill → local runtime →
project records. The Claude Code plugin distributes the Skill and references;
install the runtime separately. Files remain readable without the runtime, but
manual work has no automatic loop, isolation, budget or approval enforcement.

| Capability | Current implementation | Boundary |
|---|---|---|
| Work context | work.md, accepted digest, decisions, candidate and evidence | Chat discussions must be saved explicitly |
| Delivery loop | Fixed build/verify/review/fix flow | External CLI tools do the actual work |
| Recovery | Run/step ledger, resume, manual candidate adoption, stale locks | Active runtime is not transferred by Git clone |
| Trusted result | Real command evidence, current candidate, read-only review | Script tests do not prove real AI business capability |
| Decisions | Acceptance, exact approval, frozen checks, budget/convergence stops | No automatic merge, push or deployment |
| Efficiency | Verify cache, review range hints, parallel Work isolation | External test state must be isolated and stable |
| Feedback | Unified status/cost/decisions, liveness, webhook/DingTalk | Notifications do not approve |
| Maintenance | Check, history/replay, safe gc | Not a production monitoring service |

The runtime has no account service, telemetry, remote project database, hosted
agents or built-in model. Recorded real AI-worker evidence covers codex exec;
other CLI integrations require their own validation.

Production observation, release lanes, UI-specific policies and custom rule
languages are retired. [Migration](MIGRATION.md) preserves the old-record and
active-run boundary. [Guides](v2/guide/README.md) describe current usage.
