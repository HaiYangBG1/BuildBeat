#!/usr/bin/env node

// BuildBeat runtime CLI entry.
//
// Guard before loading any module: the kernel uses Node>=20 syntax, and on a
// machine whose default node drifted older the raw SyntaxError stack hides
// the actual problem (real incident: default node v14 during the meta pilot).
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  console.error(
    `buildbeat needs Node >= 20; this shell resolved v${process.versions.node}.\n` +
      "Check `which node` / nvm default, then rerun (e.g. `nvm use 23`).",
  );
  process.exit(1);
}

import("../src/v2/cli/run.js");
