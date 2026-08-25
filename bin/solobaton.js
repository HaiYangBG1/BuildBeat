#!/usr/bin/env node

import { run } from "../src/cli.js";

// Legacy executable alias for the published `solobaton` npm package.
process.exitCode = await run(process.argv.slice(2));
