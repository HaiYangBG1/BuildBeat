Your area: tests, package and evidence.
Files: tests/** (including the removed v2-observe and v2-release-lane tests
and the rewritten v2-policy tests), tests/support/package-files.txt, the
package.json `files` list, package-lock.json, the plugin manifests, and
delivery/work/WORK-PRODUCT-SIMPLIFY/** (recorded evidence).

Settle these questions:
- For every deleted or rewritten test, name the behaviour it protected and
  whether that behaviour is retired (fine) or still shipped (then show where
  it is tested now, or report the gap).
- New behaviour without a test: frozen checks, legacy refusal paths, work.md
  acceptance, the consolidated commands, migration errors, the checkout
  filter comparison.
- Tests that pass for the wrong reason: assertions on output text only,
  fixtures that skip the code path, platform-specific assumptions.
- Package: the files list versus package-files.txt versus what the CLI,
  Skill and plugin need at runtime; MIGRATION.md shipped; nothing private
  shipped.
- Evidence recorded in WORK-PRODUCT-SIMPLIFY: claims the recorded data does
  not support.
