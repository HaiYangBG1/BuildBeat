# BuildBeat

**Switch sessions. Keep building.**

BuildBeat keeps work context in project files, drives a recoverable delivery loop, and brings evidence to human decisions. It is for humans and AI sessions.

## Three promises

Switch sessions without losing progress; let the loop implement, verify, review and repair; inspect the candidate and evidence before deciding.

## Start

The runtime needs Node ≥ 20. Before upgrading from 3.x, finish or cancel runs still in progress with their original 3.x runtime (see [Migration](docs/MIGRATION.md)). Read [SKILL.md](SKILL.md) and the [quickstart](docs/v2/guide/01-quickstart.en.md).

```bash
npm view @haiyangbg/buildbeat@latest version
npm install --global @haiyangbg/buildbeat@latest
buildbeat --version
```

```bash
buildbeat accept --repo . --work WORK-X --by owner
buildbeat run --config delivery/work/WORK-X/run-config.yaml
buildbeat status --repo . --work WORK-X
```

## Records and handoffs

End-to-end work packages contain work.md, configuration, decisions and terminal records under delivery/work/. Local in-flight events and logs live in .buildbeat/runtime/; candidates live in .buildbeat/worktrees/. Save missing facts before switching sessions. Active runs do not migrate through Git clone.

[Handoff](docs/v2/guide/11-session-handoff.en.md) · [Recovery](docs/v2/guide/10-recovery.en.md)

## Boundaries

BuildBeat does not provide multi-user accounts, roles and permissions. It does not collect or upload project usage data and has no telemetry collection. Models and authentication belong to the configured AI tool. Merge, push, deployment and publication remain separately authorized external actions. Production monitoring, release lanes and arbitrary workflow/policy languages are outside the current product.

[Capabilities](docs/CAPABILITY-MATRIX.md) · [Security](docs/v2/guide/09-security-boundaries.en.md) · [Migration](docs/MIGRATION.md)

## Claude Code plugin

The plugin supplies Skill, templates and docs; the runtime is installed separately.

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

[Contributing](CONTRIBUTING.md) · [MIT](LICENSE)
