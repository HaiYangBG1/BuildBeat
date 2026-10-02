# Policy guide

[简体中文](03-policy-guide.md) | **English**

Authority: [`RFC-0003 §4`](../RFC-0003-workflow-policy.md) (Chinese); implementation: `src/v2/policy/policy.js`. Models: the policies embedded in the risk presets (`src/v2/presets/risk/*.yaml`) and [`ui-render-gate.yaml`](../../../src/v2/presets/policies/ui-render-gate.yaml).

## The shape of a policy

```yaml
kind: policy
version: 1
name: merge-evidence-floor
type: transition            # pre | post | transition | action
appliesTo: enter-wait-merge # pre/post: a step id; transition: enter-<step>
enforcement: LOCAL_ENFORCED # ADVISORY | LOCAL_ENFORCED | SERVER_ENFORCED
rule:
  all:
    - evidence.exists:
        kind: command
        minGrade: L2
    - finding.maxSeverity:
        atMost: P2
```

## 8 operators and three-valued logic

| Operator | Meaning |
|---|---|
| `all` / `any` / `not` | Combinators |
| `evidence.exists: {kind, minGrade}` | Evidence of the given kind exists at or above the grade |
| `artifact.accepted: {artifact}` | The artifact (plan/intent/spec) has been accepted, bound to its digest |
| `attempts.lt: {step, max}` | A step's attempts are below the limit |
| `budget.remaining: {kind}` | The budget still has room |
| `candidate.clean` | A pinned, clean candidate exists |
| `human.approved: {transition}` | A matching approval exists and is not stale |
| `finding.maxSeverity: {atMost}` | Unresolved findings are at most this severe |

Evaluation is **three-valued**: `PASS` / `FAIL` / `UNVERIFIED`. Missing data (no evidence, no candidate) is always `UNVERIFIED`, never a pass — `UNVERIFIED` is never treated as `PASS` at any gate (the six GateResult values are in RFC-0003 §3.3).

**Candidate scope**: when the subject awaiting approval carries a candidate, `evidence.exists` and `finding.maxSeverity` count only that candidate's evidence — old review findings superseded by a newer fix round do not block a candidate that has been fixed (the permanent regressions for the real incident of 2026-08-28 live in `tests/` and `evals/`).

## Four hook points

- `pre`: before a step starts (for example `plan-accepted` in front of build);
- `post`: after a step ends;
- `transition`: at the moment of a state transition (for example a re-check at the instant the merge decision is stamped — the approve command re-reads the live state before stamping, and refuses to stamp if the gate fails);
- `action`: before a protected action (together with [Security boundaries](09-security-boundaries.en.md)).

## Enforcement levels

`ADVISORY` only informs the worker; `LOCAL_ENFORCED` is carried out physically by the Runner/Workspace (use it for everything that can be guaranteed locally); `SERVER_ENFORCED` declares that the gate lives on the server (branch protection / CI / deployment platform) — the Runner records it but cannot guarantee it on the server's behalf. Label honestly: do not mark as LOCAL what cannot be stopped locally.

## Wiring it in

The run config's `policies:` list references file paths; the risk presets (`fast` / `standard` / `controlled` / `release`) bring their own policies and stop points, turned on with a single `riskPreset:` line, and project policies are layered on top.
