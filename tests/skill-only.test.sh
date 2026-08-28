#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/buildbeat-skill-only.XXXXXX")"
PROJECT="$TMP_ROOT/project"
CLI_PROJECT="$TMP_ROOT/cli-project"
FAKE_BIN="$TMP_ROOT/no-node-bin"

cleanup() {
  rm -rf -- "$TMP_ROOT"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

prepare_file_bus() {
  local target="$1"
  if [ -f "$target/pm/当期看板.md" ]; then
    mv "$target/pm/当期看板.md" "$target/pm/测试期-看板.md"
  fi
  cp "$REPO_ROOT/tests/fixtures/healthy-default/project/pm/NOW.md" "$target/pm/NOW.md"
  cp "$REPO_ROOT/tests/fixtures/healthy-default/project/pm/测试期-看板.md" "$target/pm/测试期-看板.md"
  cp "$REPO_ROOT/tests/fixtures/healthy-default/project/pm/decisions.md" "$target/pm/decisions.md"
  cp "$REPO_ROOT/tests/fixtures/healthy-default/project/pm/status/README.md" "$target/pm/status/README.md"
  cp "$REPO_ROOT/tests/fixtures/healthy-default/project/pm/changes/README.md" "$target/pm/changes/README.md"
  cp "$REPO_ROOT/tests/fixtures/healthy-default/project/contracts/PROTOCOL.md" "$target/contracts/PROTOCOL.md"
  cp "$REPO_ROOT/tests/fixtures/healthy-default/project/.gitignore" "$target/.gitignore"
  rm -f -- "$target/gitignore.template"
  rm -rf -- "$target/standards" "$target/pm/adr"
  chmod +x "$target"/scripts/*.sh
}

initialize_git() {
  local target="$1"
  local message="$2"
  git -C "$target" init -q
  git -C "$target" config user.name "BuildBeat Tests"
  git -C "$target" config user.email "tests@example.invalid"
  git -C "$target" add .
  git -C "$target" commit -qm "$message"
}

run_bus_without_node() {
  local target="$1"
  local label="$2"
  local output
  local status
  set +e
  output=$(cd "$target" && PATH="$FAKE_BIN:$PATH" BUS_CHECK_NO_FETCH=1 BUS_CHECK_NO_LIVE=1 bash scripts/bus-check.sh --strict 2>&1)
  status=$?
  set -e
  [ "$status" -eq 0 ] || {
    printf '%s\n' "$output" >&2
    fail "$label failed strict bus-check without Node (exit $status)"
  }
  printf '%s\n' "$output" | grep -F 'NOW 薄、看板归位、status 克制' >/dev/null \
    || fail "$label did not report a healthy coordination layer"
}

mkdir -p "$PROJECT" "$CLI_PROJECT" "$FAKE_BIN"

# Model the Skill/manual bootstrap path. Optional libraries stay absent and the
# version marker is rendered without creating lifecycle ownership metadata.
cp -R "$REPO_ROOT/templates/." "$PROJECT/"
prepare_file_bus "$PROJECT"
# The scaffold bundle version is pinned in src/constants.js (frozen v1
# surface), decoupled from the package version since the v2 line.
SCAFFOLD_VERSION="$(node -e "import('$REPO_ROOT/src/constants.js').then((m) => process.stdout.write(m.SCAFFOLD_VERSION))")"
sed \
  -e "s/v<X.Y>/$SCAFFOLD_VERSION/" \
  -e 's/<yyyy-mm-dd>/2026-08-25/' \
  -e 's/<默认|紧凑>/默认/' \
  "$REPO_ROOT/templates/BUILDBEAT.md" > "$PROJECT/BUILDBEAT.md"
initialize_git "$PROJECT" "Skill-only fixture baseline"

# The reverse direction stays conservative: doctor can inspect a Skill-created
# project, reports the intentionally absent manifest, and does not require one.
DOCTOR_OUTPUT="$(node "$REPO_ROOT/bin/buildbeat.js" doctor "$PROJECT" --json)"
printf '%s\n' "$DOCTOR_OUTPUT" | grep -F '"state": "installed"' >/dev/null \
  || fail "CLI doctor did not recognize the Skill-created installation"
printf '%s\n' "$DOCTOR_OUTPUT" | grep -F '"code": "manifest.missing"' >/dev/null \
  || fail "CLI doctor hid the Skill-only manifest boundary"

# The forward direction starts from a real source-CLI write, then lets the Skill
# render project-owned bus facts. Maintenance below runs with Node shadowed.
node "$REPO_ROOT/bin/buildbeat.js" init "$CLI_PROJECT" --yes --json \
  > "$TMP_ROOT/cli-init.json" 2> "$TMP_ROOT/cli-init-plan.txt"
prepare_file_bus "$CLI_PROJECT"
initialize_git "$CLI_PROJECT" "CLI-created fixture after Skill rendering"

cat > "$FAKE_BIN/node" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' 'node must not be called by the Skill-only path' >&2
exit 99
EOF
chmod +x "$FAKE_BIN/node"

run_bus_without_node "$PROJECT" "Skill-only scaffold"
run_bus_without_node "$CLI_PROJECT" "CLI-created scaffold maintained by Skill"
if [ -e "$PROJECT/.buildbeat/manifest.json" ] || [ -e "$PROJECT/.solobaton/manifest.json" ]; then
  fail "Skill-only bootstrap unexpectedly created a CLI manifest"
fi
if [ ! -f "$CLI_PROJECT/.buildbeat/manifest.json" ] || [ -e "$CLI_PROJECT/.solobaton/manifest.json" ]; then
  fail "CLI-created scaffold lost its canonical lifecycle manifest"
fi
if [ -e "$PROJECT/standards" ] || [ -e "$PROJECT/pm/adr" ]; then
  fail "Skill-only bootstrap unexpectedly generated optional standards or ADR files"
fi
if [ -e "$CLI_PROJECT/standards" ] || [ -e "$CLI_PROJECT/pm/adr" ]; then
  fail "CLI-created scaffold unexpectedly generated optional standards or ADR files"
fi

printf '%s\n' 'PASS: Skill-only and CLI/Skill interoperability work without a runtime CLI dependency'
