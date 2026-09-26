# BuildBeat v2 documentation

[简体中文](README.md) | **English**

> The normative authority is the RFCs/SPEC ([`RFC-0001`](../RFC-0001-product-definition.md) product definition / [`RFC-0002`](../RFC-0002-domain-model.md) domain model / [`RFC-0003`](../RFC-0003-workflow-policy.md) workflow and policy / [`SPEC-0001`](../SPEC-0001-events-v1.md) event schema; all in Chinese); this directory is the operator's view, and where it conflicts with the implementation, the RFCs/SPEC and the code win — please report it. Design history (V2-PLAN, iteration records) is not in this directory.

## First use

| Document | In one line |
|---|---|
| [How to talk to a session](00-how-to-talk.en.md) | **For users**: from not started to the next phase, what you say at each stage, what the session does, what you get |
| [Quickstart](01-quickstart.en.md) | The first Run: install `@latest` → work item and run config → accept → doctor → start → read the evidence and decide; failure branches included |
| [`templates/v2/`](../../../templates/v2/AGENTS.md) | Project entry points (AGENTS / CLAUDE / command board / BUILDBEAT marker), run config sample, envelope prompts and the worker wrapper |

People working in an AI session only need document 0; the session reads the driving manual in `SKILL.md` §0.5.

## Day to day

| Document | In one line |
|---|---|
| [Human approval guide](07-approval-guide.en.md) | inbox / approve / stale; what accept, approving a transition and the merge decision each mean; the triage gate; waits must reach a person; overview |
| [Evidence guide](06-evidence-guide.en.md) | Read-back evidence, status/grade, the UNVERIFIED culture, observe |
| [Session and team handoff](11-session-handoff.en.md) | Writing context down, closing the old chat, a new member taking over, cross-tool and cross-machine boundaries |
| [Recovery](10-recovery.en.md) | Corrupted ledger, interrupted Run, infra stops, locks, rebuilding after deleting the runtime, gc |

## Configuration reference

| Document | In one line |
|---|---|
| [Workflow authoring guide](02-workflow-guide.en.md) | Step order, explicit transitions, readonly, terminal, budgets, cache, requires, parallel runs |
| [Policy guide](03-policy-guide.en.md) | Four policy types, 8 operators, three-valued logic, enforcement levels |
| [Adapter guide](04-adapter-guide.en.md) | Shell/Mock, the env allowlist and `env:` injection, plugging in any CLI agent, live output |
| [Worker contract](05-worker-contract.en.md) | The input/output envelope (`severity` + `summary`), blocking semantics, per-role discipline, the wrapper script |
| [Security and permission boundaries](09-security-boundaries.en.md) | What the kernel actually does vs what cannot be concluded from it; the three preconditions for running unattended |

observe v0 (probe → tiered response → intent drafts → human triage) is covered in [Quickstart §9](01-quickstart.en.md) and the [Evidence guide](06-evidence-guide.en.md); its frozen schema is [`RFC-0003 §8`](../RFC-0003-workflow-policy.md).
