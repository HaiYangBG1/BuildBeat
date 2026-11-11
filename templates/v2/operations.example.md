# Operations

How to release, roll back and run this project, and the traps that have bitten before. Rules and steps only: what is deployed right now comes from buildbeat status --releases, not from this page.

<!-- Copy this file to docs/operations.md (or keep these sections in the project's own manual). Write each line once and fix it when it turns out wrong; a work's result.md points here under "Written into the project". -->

## Environments
- <name>: what it is for, how to reach it, what it needs (runtime versions, services, data).

## Release
1. The steps a person takes, in order, with the project's own commands or scripts (keep scripts in the project, for example under deploy/).
2. After each step, read it back: `buildbeat release --repo . --work <WORK-ID> --env <name> --note "<step>"`.

## Roll back
- How to go back to the previous version, and how to tell that it worked.

## Traps
- What went wrong before, how to tell it is happening again, and what to do. One line each, naming the work that found it.
