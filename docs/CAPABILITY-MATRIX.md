# BuildBeat capability matrix / 能力矩阵

Two ways to use it. Skill → project records keeps each work's context in Git
with no runtime: [Skill and project files only](v2/guide/12-without-runtime.en.md)
states what is written by hand and what must not be claimed. Skill → local
runtime → project records adds verification and an independent read-only review
of a commit, approval bound to that commit, and the runtime's checks of the
records. The session writes the code; the runtime never does. The Claude Code
plugin distributes the Skill, templates and guides; install the runtime
separately.

| Capability | Current implementation | Boundary |
|---|---|---|
| Work context | work.md (why now, facts checked with sources, decisions before starting), accepted digest, decisions with the person's own words; result.md at closing; lines of code traced back to their works (`history --path`: reviewed ranges, `Work:` trailers, work folders); related works strung into one thread across repositories (`follows` / `split from` / `related` / `ref` lines; `status --work`, `status --ref`); code the facts point at (`path:<start>-<end>` under a heading naming the commit checked on) compared with where the work starts, in `status --work` and as `accept` / `check` warnings | Chat discussions must be saved explicitly; records kept out of Git cannot be found elsewhere |
| Review of a commit | `review`: the project's verification, then a read-only reviewer, in a temporary checkout of that commit; ends `FAILED`, `CANCELLED` or waiting for the decision | The configured tools do the actual work; nothing is written, retried or repaired |
| Trusted result | Real command evidence on the reviewed commit, scope check (`allowedPaths`), reviewer that may not touch files | Script tests do not prove what a real model can do |
| Decisions | Acceptance of work.md by digest, approval that names the full commit, findings ruled on by fingerprint, who decided and in what capacity | No merge, push or deployment |
| Status | One `status` for stages, pending decisions, findings and cost, also across a main repository and its code repositories (`--all-repos`) | Reads local records; no server |
| UI evidence | `requireScreenshot`: decodable PNG screenshots from verify, bound to the commit and required at approval | The project's verify renders and captures |
| Closeout | Every work closes with result.md bound by digest; "path @ commit" lines for conclusions written into project documents are checked against Git; a work that declares a release also needs a passing `release` readback | No deployment; observation stays with project monitoring; the runtime checks the page, it does not write it |

The runtime has no account service, telemetry, remote project database, hosted
agents or built-in model. A review with a real AI tool has been run with
codex exec; other tools need their own validation.

Records left by earlier versions are not changed. Closed works still show as
closed; an unclosed work in the earlier format shows as `LEGACY`.
[Guides](v2/guide/README.md) describe current usage.
