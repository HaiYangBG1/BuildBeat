# STACK.md — matching fixture

> **Optional**: optional and project-owned; missing means skip.
> **AI write boundary**: read-only unless the user confirms a standards change.
> **Status**: Confirmed

## Observable baseline

<!-- buildbeat-stack-baseline:v1
nodeConstraint=22
nodeConstraint=>=22 <23
lockfileKind=package-lock.json
dockerFromImage=node:22-alpine
-->

## Rules

- `STACK-MUST-001`: Observable facts and the declared stack must not be silently reconciled.
