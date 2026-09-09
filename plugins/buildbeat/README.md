# BuildBeat Claude Code plugin

Switch sessions. Keep building. This plugin guides people and AI sessions through project context in files, handoffs across models, tools, and people, specialist collaboration, and BuildBeat's build–verify–review–fix loop. Human decisions remain tied to the work and its evidence.

## Install and use

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

For a local source checkout, replace the marketplace address with its absolute path. Invoke `/buildbeat:buildbeat` and ask the session to read the target project's entry point, inspect current work and pending decisions, and identify the next step. See [session handoffs](docs/v2/guide/11-session-handoff.en.md).

The plugin supplies the Skill, templates, and documentation. Install the runtime separately, following the [main README](https://github.com/HaiYangBG1/BuildBeat/blob/main/README.en.md); source templates may require a newer runtime than the published stable package. Check plugin loading through the invocation above and runtime availability with `buildbeat overview --repo .` in the target project. A CLI response does not establish that the project has its first Work configured.

## Packaging boundary

This directory is the self-contained marketplace boundary for the `buildbeat` plugin. Its `SKILL.md`, templates, example project, reference docs, lessons, changelog, and license are repository-relative symbolic links to the canonical files at the marketplace root.

Claude Code dereferences links whose targets remain inside the same marketplace when it copies a plugin into its versioned cache. The installed plugin therefore contains regular cached files and does not depend on the source checkout at runtime. Keep these links relative and inside this repository; do not replace them with paths outside the marketplace. This boundary follows the official [plugin reference](https://code.claude.com/docs/en/plugins-reference) and [marketplace guide](https://code.claude.com/docs/en/plugin-marketplaces).

The root [`SKILL.md`](SKILL.md) is auto-discovered as the plugin's single skill. Its stable invocation is `/buildbeat:buildbeat`.
