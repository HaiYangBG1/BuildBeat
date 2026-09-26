# Notes — WORK-REVIEW-CLEANUP

## C. Temporary directories (measured 2026-09-26)

- Before: one full `node --test tests/*.test.js` left 147 new entries (24 MB) in `$TMPDIR` (the worst single file: 18 from the budget false-stops tests, which imported `rmSync` but never used it for cleanup).
- After converting all 52 `mkdtempSync(join(tmpdir(), …))` call sites in 42 test files to `tempDir()` from `tests/support/tmp.js`: 0 new entries after a full run; 241/241 tests pass.
- Deviation from the plan, noted for review: the plan named the 32 files without any `rmSync`; the measurement showed leaks from files that import `rmSync` but do not clean up, so every test file was converted and the guard forbids `mkdtempSync` in test files outright.

## E. docs/ archive and package whitelist

- 36 files moved with `git mv`: 23 planning / iteration / pilot / roadmap documents into `docs/history/`, 13 release evidence files into `docs/releases/`. Top-level `docs/` now holds `README.md`, `CAPABILITY-MATRIX.md`, `RELEASING.md` and `v2/`.
- Relative links were recomputed from each file's new location to each target's new location (34 files); accepted Work artifacts under `delivery/` were left untouched so their accepted digests stay valid. The docs check's relative-link validation passes.
- `package.json` `files` lists `docs/README.md`, `docs/CAPABILITY-MATRIX.md`, `docs/RELEASING.md` and `docs/v2/` (minus the M1/M2/M4 records) instead of `docs/` with 13 exclusions; the docs check rejects `docs/` wholesale or any `docs/history|releases` entry.
- Package file list (`npm pack --dry-run --json`), compared with the published 3.1.0 list: 113 files before, 113 after, identical path for path. (Kept as a one-off comparison plus the structural rule above rather than a frozen list in the tests, which every future release would have to rewrite.)
- Six GitHub Release notes (v2.0.0-beta.1 … v2.0.1) mention evidence or iteration files by their old `docs/` path as plain text; those files remain at those paths at their tags, so nothing a reader follows breaks, and published release notes were not edited.
