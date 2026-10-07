# BuildBeat

**Switch sessions. Keep building.**

BuildBeat is for humans and AI sessions: the work description and every record stay in project files and Git; implementation, verification, review and repair move forward outside the session and can always resume; the candidate waits with its evidence for your merge decision.

## Three promises

- **Walk away.** Each work gets one `work.md`; once accepted, `buildbeat run` drives it. Close the session, switch AI tools or hand over to someone else, and continue from the project files and the run ledger. In a main repository with several code repositories, `buildbeat status --repo . --all-repos` shows what is pending everywhere.
- **Come back to facts.** Verification runs the project's own commands, and the runtime reads results back from Git and the ledger instead of trusting what an AI says; review is independent and read-only. Missing tools, an unavailable backend or a review that hands in no report stop as infrastructure failures for a person, instead of being "fixed" as code.
- **Decide with confidence.** A merge approval is bound to the candidate you reviewed (`--candidate`). When you spot a small problem at the merge decision, commit a fix and hand it over (`run --adopt`) or send it back to the fixer in one line (`decide --action fix`), without starting a new run. Merge, push, release and deployment stay with people.

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

End-to-end work packages contain work.md, configuration, decisions, review findings and terminal records under delivery/work/. Local in-flight events and logs live in .buildbeat/runtime/; candidates live in .buildbeat/worktrees/. The cost line in `status` shows review rounds, findings and where human waits went (decided, superseded, stopped, still open). Save missing facts before switching sessions; active runs do not migrate through Git clone. People and tools without the runtime can still read status and write work descriptions.

[Handoff](docs/v2/guide/11-session-handoff.en.md) · [Recovery](docs/v2/guide/10-recovery.en.md) · [Without the runtime](docs/v2/guide/12-without-runtime.en.md)

## Boundaries

BuildBeat does not provide multi-user accounts, roles and permissions. It does not collect or upload project usage data and has no telemetry collection. Models and authentication belong to the configured AI tool. Merge, push, deployment and publication remain separately authorized external actions; after a release, `buildbeat release` records the project's own readback and the window closes only when it passes. Production monitoring and arbitrary workflow/policy languages are outside the product.

[Capabilities](docs/CAPABILITY-MATRIX.md) · [Security](docs/v2/guide/09-security-boundaries.en.md) · [Migration](docs/MIGRATION.md)

## Claude Code plugin

The plugin supplies Skill, templates and docs; the runtime is installed separately.

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

[Contributing](CONTRIBUTING.md) · [MIT](LICENSE)
