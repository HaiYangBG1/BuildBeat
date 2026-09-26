# Notes — WORK-REVIEW-CLEANUP

## C. Temporary directories (measured 2026-09-26)

- Before: one full `node --test tests/*.test.js` left 147 new entries (24 MB) in `$TMPDIR` (the worst single file: 18 from the budget false-stops tests, which imported `rmSync` but never used it for cleanup).
- After converting all 52 `mkdtempSync(join(tmpdir(), …))` call sites in 42 test files to `tempDir()` from `tests/support/tmp.js`: 0 new entries after a full run; 241/241 tests pass.
- Deviation from the plan, noted for review: the plan named the 32 files without any `rmSync`; the measurement showed leaks from files that import `rmSync` but do not clean up, so every test file was converted and the guard forbids `mkdtempSync` in test files outright.
