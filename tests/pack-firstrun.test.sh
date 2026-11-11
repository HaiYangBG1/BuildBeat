#!/usr/bin/env bash
# Packaged first review: pack the npm artifact, install it into an isolated
# prefix, and review a commit from the *installed* templates with a scripted
# reviewer until the owner approves it. This proves the published package
# carries every path the quickstart relies on (bin/, templates/v2/), not
# that a real model can complete a task. Source-tree tests cannot catch a
# file missing from package.json "files"; this one can.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/buildbeat-pack-firstrun.XXXXXX")"
ASSERTIONS=0
OUTPUT=""

cleanup() {
  rm -rf -- "$TMP_ROOT"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  if [ -n "$OUTPUT" ]; then
    printf '%s\n' '--- command output ---' >&2
    printf '%s\n' "$OUTPUT" >&2
  fi
  exit 1
}

pass() {
  ASSERTIONS=$((ASSERTIONS + 1))
  printf 'ok %02d - %s\n' "$ASSERTIONS" "$1"
}

expect_contains() {
  printf '%s\n' "$OUTPUT" | grep -F -- "$1" >/dev/null || fail "$2 (missing: $1)"
  pass "$2"
}

expect_not_contains() {
  if printf '%s\n' "$OUTPUT" | grep -F -- "$1" >/dev/null; then
    fail "$2 (unexpected: $1)"
  fi
  pass "$2"
}

# 1. Pack and install into an isolated prefix (zero runtime dependencies,
#    so --offline must be enough). This script also runs from prepublishOnly,
#    where a parent `npm publish --dry-run` exports npm_config_dry_run to
#    every nested npm and `npm pack` would then write nothing: clear it.
unset npm_config_dry_run NPM_CONFIG_DRY_RUN
(cd "$REPO_ROOT" && npm pack --silent --pack-destination "$TMP_ROOT" >/dev/null)
TARBALL="$(find "$TMP_ROOT" -maxdepth 1 -name '*.tgz' | head -n 1)"
[ -n "$TARBALL" ] || fail "npm pack produced no tarball"
PREFIX="$TMP_ROOT/prefix"
mkdir -p "$PREFIX"
npm install --global --prefix "$PREFIX" --ignore-scripts --no-audit --no-fund --offline "$TARBALL" >/dev/null 2>&1 \
  || fail "isolated global install of the packed artifact failed"
BIN_DIR="$PREFIX/bin"
PKG_DIR="$PREFIX/lib/node_modules/@haiyangbg/buildbeat"
[ -x "$BIN_DIR/buildbeat" ] || fail "installed package has no executable buildbeat"
pass "packed artifact installs the buildbeat executable"
for relative in \
  templates/v2/run-config.example.yaml \
  templates/v2/work.example.md \
  templates/v2/result.example.md \
  templates/v2/envelope/worker.sh \
  templates/v2/envelope/prompts/reviewer.md \
  templates/v2/AGENTS.md \
  docs/v2/guide/01-quickstart.md; do
  [ -f "$PKG_DIR/$relative" ] || fail "packed artifact is missing $relative"
done
pass "packed artifact carries the quickstart's templates, envelope, and guide"
for relative in \
  src/v2/presets/software-delivery.yaml \
  templates/v2/envelope/prompts/builder.md \
  templates/v2/envelope/prompts/fixer.md; do
  [ ! -e "$PKG_DIR/$relative" ] || fail "packed artifact still ships $relative"
done
pass "packed artifact ships no builder or fixer prompt and no workflow preset"
for relative in \
  docs/README.md \
  docs/CAPABILITY-MATRIX.md \
  docs/RELEASING.md \
  docs/v2/RFC-0001-product-definition.md \
  docs/v2/RFC-0002-domain-model.md \
  docs/v2/RFC-0003-workflow-policy.md \
  docs/v2/SPEC-0001-events-v1.md \
  docs/v2/guide/README.md \
  docs/v2/guide/11-session-handoff.md; do
  [ -f "$PKG_DIR/$relative" ] || fail "packed artifact is missing current doc $relative"
done
pass "packed artifact carries every current doc (index, matrix, RFC/SPEC, guides)"
# Historical records (iteration logs, release evidence, pilots, plans) stay in
# the repository only; package.json "files" negates them so installs do not
# carry them. Guard the negation so a later edit cannot quietly ship them again.
HISTORICAL_SHIPPED="$(cd "$PKG_DIR/docs" && find . -type f \( \
  -name '*-RELEASE-EVIDENCE-*.md' -o -name 'V2-ITERATION-*.md' -o -name 'PHASE*.md' \
  -o -name 'V2-PLAN.md' -o -name 'V2-PROPOSAL.md' -o -name 'V2-DECISIONS.md' \
  -o -name 'V2-D2-DECISION-CARD.md' -o -name 'ROADMAP.md' -o -name 'EXECUTION-PLAN.md' \
  -o -name 'CLI-STRATEGY-*.md' -o -name 'CLI-PILOT-*.md' -o -name 'M[124]-*.md' \
  -o -name 'BuildBeat v2*.md' \) | sort)"
[ -z "$HISTORICAL_SHIPPED" ] || { OUTPUT="$HISTORICAL_SHIPPED"; fail "packed artifact ships historical docs that package.json files should exclude"; }
pass "packed artifact excludes historical docs (iteration logs, release evidence, pilots, plans)"
[ -f "$PKG_DIR/example/delivery/run-config.yaml" ] || fail "packed artifact is missing the example project's run config"
[ -f "$PKG_DIR/example/delivery/work/WORK-EXPORT-DATE-FILTER/work.md" ] || fail "packed artifact is missing the example project's work"
[ -f "$PKG_DIR/CHANGELOG.md" ] || fail "packed artifact is missing CHANGELOG.md"
[ ! -e "$PKG_DIR/CHANGELOG-v1.md" ] || fail "packed artifact ships the repository-only CHANGELOG-v1.md"
pass "packed artifact carries CHANGELOG.md and not the v1 changelog archive"

OUTPUT="$("$BIN_DIR/buildbeat" 2>&1 || true)"
expect_contains "BuildBeat runtime" "installed buildbeat prints its usage"

# 2. Fixture project laid out the way docs/v2/guide/01-quickstart.md does,
#    reading every BuildBeat file from the installed package.
PROJECT="$TMP_ROOT/project"
mkdir -p "$PROJECT"
git init -q -b main "$PROJECT"
git -C "$PROJECT" config user.email "pilot@example.com"
git -C "$PROJECT" config user.name "Pilot"
mkdir -p "$PROJECT/src" "$PROJECT/tools" "$PROJECT/delivery/work/WORK-PACK"
printf '.buildbeat/\n' > "$PROJECT/.gitignore"
cp -R "$PKG_DIR/templates/v2/envelope" "$PROJECT/delivery/envelope"

cat > "$PROJECT/tools/fake-reviewer.sh" <<'AGENT'
#!/usr/bin/env bash
set -euo pipefail
node -e 'const i=JSON.parse(process.env.BUILDBEAT_INPUT);const fs=require("node:fs");if(i.workArtifact?.ref!=="delivery/work/WORK-PACK/work.md"||!fs.existsSync(i.workArtifact.ref)||!fs.readFileSync(process.env.BUILDBEAT_PROMPT,"utf8").includes("work.md"))process.exit(9)'
prompt=${@: -1}
[ -n "$prompt" ] || exit 9
printf '%s\n' '{"status":"succeeded","findings":[{"severity":"P2","summary":"naming could be clearer"}]}'
AGENT

# The installed sample, with codex swapped for the scripted reviewer and the
# verifier pointed at the file the change adds.
sed -e 's|      - npm test|      - test -f src/feature.txt|' \
  "$PKG_DIR/templates/v2/run-config.example.yaml" \
  | awk '
      /^      - codex$/ { print "      - bash"; print "      - tools/fake-reviewer.sh"; skip = 3; next }
      skip > 0 { skip--; next }
      { print }
    ' > "$PROJECT/delivery/run-config.yaml"
if grep -q '^ *- codex$' "$PROJECT/delivery/run-config.yaml"; then fail "the sample still names codex after the swap"; fi
git -C "$PROJECT" add .
git -C "$PROJECT" commit -q -m "baseline"

printf '# Add the feature\n\n## Goal\nwrite src/feature.txt\n' > "$PROJECT/delivery/work/WORK-PACK/work.md"
git -C "$PROJECT" add .
git -C "$PROJECT" commit -q -m "describe WORK-PACK"

# 3. The quickstart order: accept -> check -> commit -> review -> approve.
export PATH="$BIN_DIR:$PATH"
OUTPUT="$(cd "$PROJECT" && buildbeat accept --repo . --work WORK-PACK --by owner --as human 2>&1)"
expect_contains "accepted work as A-WORK-PACK-" "accept records the work digest"

OUTPUT="$(cd "$PROJECT" && buildbeat check --repo . --work WORK-PACK 2>&1)"
expect_contains "work.md: accepted" "check reads the accepted work"
expect_contains "environment: allowlist; host credentials withheld" "check reports the workers' environment"
expect_contains "ready: commit the change, then buildbeat review --repo . --work WORK-PACK" "check says what comes next"

echo feature > "$PROJECT/src/feature.txt"
git -C "$PROJECT" add .
git -C "$PROJECT" commit -q -m "add the feature" -m "Work: WORK-PACK"
CANDIDATE="$(git -C "$PROJECT" rev-parse HEAD)"

OUTPUT="$(cd "$PROJECT" && buildbeat review --repo . --work WORK-PACK 2>&1)"
expect_contains "status: WAITING_HUMAN" "review stops for the owner"
expect_contains "waiting on human: enter-wait-merge" "review stops at the merge decision"
expect_contains "--action approve --candidate $CANDIDATE" "review prints the approval of this commit"
expect_not_contains "$TMP_ROOT" "review output never prints the host absolute path"

OUTPUT="$(cd "$PROJECT" && buildbeat status --repo . --run RUN-PACK-01 2>&1)"
expect_contains "step verify: SUCCEEDED (attempts 1)" "the project's verify command ran on the commit"
expect_contains "evidence [passed/L2] review" "the reviewer's report became evidence"
expect_not_contains "infra" "no step was misread as an infrastructure failure"

OUTPUT="$(cd "$PROJECT" && buildbeat decide --repo . --work WORK-PACK --action approve --candidate "$CANDIDATE" --by owner --as human 2>&1)"
expect_contains "RUN-PACK-01 is terminal: SUCCEEDED" "the owner's approval of the commit is recorded"

OUTPUT="$(cd "$PROJECT" && buildbeat status --repo . 2>&1)"
expect_contains "WORK-PACK  MERGED" "status shows the approved work"
[ ! -e "$PROJECT/.buildbeat/worktrees/RUN-PACK-01" ] || fail "the review checkout was left behind"
pass "the review checkout is gone"

printf 'PASS: packaged first review reached the approval from the installed artifact (%d assertions)\n' "$ASSERTIONS"
