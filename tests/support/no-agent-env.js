// Loaded before every test file (package.json "test"): decisions now record
// whether they came from an AI session by reading the host's markers, so a
// suite run inside an AI coding tool must not inherit them. Tests that cover
// detection pass their own environment.
for (const name of ["CLAUDECODE", "CODEX_SANDBOX", "AI_AGENT", "BUILDBEAT_ACTOR"]) {
  delete process.env[name];
}
