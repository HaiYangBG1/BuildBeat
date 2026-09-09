#!/usr/bin/env bash
# Packaged first run: pack the npm artifact, install it into an isolated
# prefix, and drive a v2 run from the *installed* templates and presets with
# a scripted agent until it stops at the merge decision. This proves the
# published package carries every path the quickstart relies on
# (bin/, src/v2/presets/, templates/v2/envelope/) — not that a real model
# can complete a task. Source-tree tests cannot catch a file missing from
# package.json "files"; this one can.
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
[ -x "$BIN_DIR/buildbeat-v2" ] || fail "installed package has no executable buildbeat-v2"
[ -x "$BIN_DIR/buildbeat" ] || fail "installed package has no executable buildbeat"
pass "packed artifact installs both executables"
for relative in \
  src/v2/presets/software-delivery.yaml \
  templates/v2/run-config.example.yaml \
  templates/v2/envelope/worker.sh \
  templates/v2/envelope/prompts/builder.md \
  templates/v2/envelope/prompts/reviewer.md \
  templates/v2/envelope/prompts/fixer.md \
  templates/v2/AGENTS.md \
  docs/v2/guide/01-quickstart.md; do
  [ -f "$PKG_DIR/$relative" ] || fail "packed artifact is missing $relative"
done
pass "packed artifact carries the quickstart's preset, templates, envelope, and guide"
for relative in \
  docs/README.md \
  docs/CLI.md \
  docs/CHECKS.md \
  docs/CAPABILITY-MATRIX.md \
  docs/LEGACY-V1.16-MIGRATION.md \
  docs/RELEASING.md \
  docs/v2/RFC-0001-product-definition.md \
  docs/v2/RFC-0002-domain-model.md \
  docs/v2/RFC-0003-workflow-policy.md \
  docs/v2/SPEC-0001-events-v1.md \
  docs/v2/guide/README.md \
  docs/v2/guide/11-session-handoff.md; do
  [ -f "$PKG_DIR/$relative" ] || fail "packed artifact is missing current doc $relative"
done
pass "packed artifact carries every current doc (index, v1 CLI contract, matrix, RFC/SPEC, guides)"
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

OUTPUT="$("$BIN_DIR/buildbeat-v2" 2>&1 || true)"
expect_contains "BuildBeat v2 runtime" "installed buildbeat-v2 prints its usage"

# 2. Fixture project laid out the way docs/v2/guide/01-quickstart.md §1 does,
#    reading every BuildBeat file from the installed package.
PROJECT="$TMP_ROOT/project"
mkdir -p "$PROJECT"
git init -q -b main "$PROJECT"
git -C "$PROJECT" config user.email "pilot@example.com"
git -C "$PROJECT" config user.name "Pilot"
mkdir -p "$PROJECT/src" "$PROJECT/tests" "$PROJECT/tools" "$PROJECT/delivery/work/WORK-PACK"
: > "$PROJECT/src/.gitkeep"
: > "$PROJECT/tests/.gitkeep"
printf '# intent\nadd feature. stop-loss: 2 runs\n' > "$PROJECT/delivery/work/WORK-PACK/intent.md"
printf '# plan\n1. write src/feature.txt\n' > "$PROJECT/delivery/work/WORK-PACK/plan.md"
cp "$PKG_DIR/src/v2/presets/software-delivery.yaml" "$PROJECT/delivery/work/WORK-PACK/workflow.yaml"
cp -R "$PKG_DIR/templates/v2/envelope" "$PROJECT/delivery/envelope"

cat > "$PROJECT/tools/fake-agent.sh" <<'AGENT'
#!/usr/bin/env bash
set -euo pipefail
role=$1
prompt=${@: -1}
case "$role" in
  build) [ -n "$prompt" ] || exit 9; echo feature > src/feature.txt ;;
  fix) [ -n "$prompt" ] || exit 9; echo fixed > src/fixed.txt ;;
  review) [ -n "$prompt" ] || exit 9; printf '%s\n' '{"status":"succeeded","findings":[{"severity":"P2","summary":"naming could be clearer"}]}' ;;
esac
AGENT

cat > "$PROJECT/delivery/work/WORK-PACK/run-config.yaml" <<'CONFIG'
repo: ../../..
work: WORK-PACK
run: RUN-PACK
workflow: workflow.yaml
riskPreset: standard
entry: build
allowedPaths:
  - src
  - tests
envelope:
  prompts: ../../envelope/prompts
workers:
  builder:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - builder
      - --
      - bash
      - tools/fake-agent.sh
      - build
  verifier:
    command: bash
    args:
      - -lc
      - test -f src/feature.txt && test -f src/fixed.txt
  reviewer:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - reviewer
      - --
      - bash
      - tools/fake-agent.sh
      - review
  fixer:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - fixer
      - --
      - bash
      - tools/fake-agent.sh
      - fix
CONFIG

git -C "$PROJECT" add .
git -C "$PROJECT" commit -q -m "baseline"

# 3. The quickstart order: accept -> doctor -> start -> read evidence.
export PATH="$BIN_DIR:$PATH"
OUTPUT="$(cd "$PROJECT" && buildbeat-v2 accept --repo . --work WORK-PACK --artifact plan --by owner 2>&1)"
expect_contains "accepted plan as A-WORK-PACK-" "accept records the plan digest"

OUTPUT="$(cd "$PROJECT" && buildbeat-v2 doctor --config delivery/work/WORK-PACK/run-config.yaml 2>&1)"
expect_contains "plan.md: accepted" "doctor reads the accepted plan"
expect_contains "fixer: env allowlist" "doctor reports the fixer's env posture"

OUTPUT="$(cd "$PROJECT" && buildbeat-v2 start --config delivery/work/WORK-PACK/run-config.yaml --attempt new 2>&1)"
expect_contains "status: WAITING_HUMAN" "start stops for a human"
expect_contains "waiting on human: enter-wait-merge" "start stops at the merge decision"
expect_not_contains "$TMP_ROOT" "start output never prints the host absolute path"

OUTPUT="$(cd "$PROJECT" && buildbeat-v2 status --repo . --run RUN-PACK-01 2>&1)"
expect_contains "step verify: SUCCEEDED (attempts 2)" "verify failed once and passed after the fixer"
expect_contains "step fix: SUCCEEDED (attempts 1)" "the packaged wrapper drove the fixer"
expect_contains "evidence [passed/L2] review" "the reviewer envelope became evidence"
expect_not_contains "infra" "no step was misread as an infrastructure failure"

OUTPUT="$(cd "$PROJECT" && buildbeat-v2 overview --repo . 2>&1)"
expect_contains "WORK-PACK" "overview lists the work"

printf 'PASS: packaged first run reached the merge decision from the installed artifact (%d assertions)\n' "$ASSERTIONS"
