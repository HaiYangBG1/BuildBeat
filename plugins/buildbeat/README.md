# BuildBeat Claude Code plugin

Git-based project context management. This plugin guides people and AI sessions to keep why each piece of work was done, what was decided and where it stands in the project's Git, next to the code, so any session, tool or person can carry on. With the optional runtime, BuildBeat also builds, tests, reviews and fixes the change, then stops for a human decision.

## Install and use

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

For a local source checkout, replace the marketplace address with its absolute path. Invoke `/buildbeat:buildbeat` and ask the session to read the target project's entry point, inspect current work and pending decisions, and identify the next step. See [session handoffs](docs/v2/guide/11-session-handoff.en.md).

The plugin supplies the Skill, templates, and documentation. That alone is enough to keep each work's context in the project's Git: see [Skill and project files only](docs/v2/guide/12-without-runtime.en.md). For the automatic build–verify–review–fix loop and the runtime's checks of those records, install the runtime separately, following the [main README](https://github.com/HaiYangBG1/BuildBeat/blob/main/README.en.md); source templates may require a newer runtime than the published stable package. Check plugin loading through the invocation above and, once the runtime is installed, its availability with `buildbeat status --repo .` in the target project. A CLI response does not establish that the project has its first Work configured.

## Packaging boundary

This directory is the self-contained marketplace boundary for the `buildbeat` plugin. Its `SKILL.md`, templates, example project, reference docs, lessons, changelog, and license are repository-relative symbolic links to the canonical files at the marketplace root.

Claude Code dereferences links whose targets remain inside the same marketplace when it copies a plugin into its versioned cache. The installed plugin therefore contains regular cached files and does not depend on the source checkout at runtime. Keep these links relative and inside this repository; do not replace them with paths outside the marketplace. This boundary follows the official [plugin reference](https://code.claude.com/docs/en/plugins-reference) and [marketplace guide](https://code.claude.com/docs/en/plugin-marketplaces).

The root [`SKILL.md`](SKILL.md) is auto-discovered as the plugin's single skill. Its stable invocation is `/buildbeat:buildbeat`.
