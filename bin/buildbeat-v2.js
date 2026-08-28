#!/usr/bin/env node

// v2 runtime CLI entry. The v1 `buildbeat` bin stays frozen on src/cli.js;
// v2 ships as a separate entry until it takes over `latest`.

import "../src/v2/cli/run.js";
