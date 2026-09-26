# Notes — WORK-YAML-SUBSET

- Local compatibility check (plan step 8), 2026-09-26: every BuildBeat YAML file under the owner's pilot workspaces (`delivery/` and `.buildbeat/`: run configs, workflows, policies, observe, notify) was parsed with the frozen previous parser and the new one: 265 files, 265 accepted by the previous parser, 265 identical, 0 differences. Only counts are recorded; the files are not in this repository.
- Deviation noted for review: the plan put the frozen previous parser at `tests/fixtures/yaml-subset-v1.js`, but `tests/fixtures` is on the docs check's list of removed v1 paths that must stay absent, so the copy lives at `tests/support/yaml-subset-v1.js` instead. Same content, same purpose.
- The in-repo compatibility test scans `src/`, `templates/`, `example/`, `delivery/` and `.buildbeat/`; `.github/` holds GitHub's own full-YAML files, which were never BuildBeat configs and both parsers reject.
