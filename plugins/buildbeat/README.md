# BuildBeat Claude Code plugin

This directory is the self-contained marketplace boundary for the `buildbeat` plugin. Its `SKILL.md`, templates, example, reference docs, lessons, changelog, and license are repository-relative symbolic links to the canonical files at the marketplace root.

Claude Code dereferences links whose targets remain inside the same marketplace when it copies a plugin into its versioned cache. The installed plugin therefore contains regular cached files and does not depend on the source checkout at runtime. Keep these links relative and inside this repository; do not replace them with paths outside the marketplace. This boundary follows the official [plugin reference](https://code.claude.com/docs/en/plugins-reference) and [marketplace guide](https://code.claude.com/docs/en/plugin-marketplaces).

The root [`SKILL.md`](SKILL.md) is auto-discovered as the plugin's single skill. Its stable invocation is `/buildbeat:buildbeat`.
