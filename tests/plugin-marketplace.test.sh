#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/buildbeat-plugin-marketplace.XXXXXX")"
CONFIG_DIR="$TMP_ROOT/config"
CACHE_DIR="$TMP_ROOT/cache"
LIST_JSON="$TMP_ROOT/plugin-list.json"
CLAUDE_BIN="${CLAUDE_BIN:-}"
ASSERTIONS=0

cleanup() {
  rm -rf -- "$TMP_ROOT"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

pass() {
  ASSERTIONS=$((ASSERTIONS + 1))
  printf 'ok %02d - %s\n' "$ASSERTIONS" "$1"
}

expect_link() {
  relative="$1"
  expected="$2"
  link="$REPO_ROOT/plugins/buildbeat/$relative"
  [ -L "$link" ] || fail "$relative must remain a repository-relative symbolic link"
  [ "$(readlink "$link")" = "$expected" ] \
    || fail "$relative points outside its canonical repository source"
  [ -e "$link" ] || fail "$relative has a missing canonical source"
}

python3 - "$REPO_ROOT" <<'PY'
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
marketplace = json.loads(
    (root / ".claude-plugin/marketplace.json").read_text(encoding="utf-8")
)
assert marketplace["name"] == "buildbeat-plugins"
assert len(marketplace["plugins"]) == 1
entry = marketplace["plugins"][0]
assert entry["name"] == "buildbeat"
assert entry["source"] == "./plugins/buildbeat"

manifest = json.loads(
    (root / "plugins/buildbeat/.claude-plugin/plugin.json").read_text(
        encoding="utf-8"
    )
)
assert manifest["$schema"] == (
    "https://json.schemastore.org/claude-code-plugin-manifest.json"
)
assert manifest["name"] == "buildbeat"
assert re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"])
assert "skills" not in manifest
PY
pass "marketplace and plugin manifests have the expected bounded shape"

expect_link "SKILL.md" "../../SKILL.md"
expect_link "templates" "../../templates"
expect_link "docs" "../../docs"
expect_link "example" "../../example"
expect_link "lessons.md" "../../lessons.md"
expect_link "LICENSE" "../../LICENSE"
expect_link "CHANGELOG.md" "../../CHANGELOG.md"
pass "plugin assets route to canonical files inside the same marketplace"

[ ! -e "$REPO_ROOT/plugins/buildbeat/bin" ] \
  || fail "plugin boundary must not expose the npm CLI bin directory"
grep -F 'name: buildbeat' "$REPO_ROOT/plugins/buildbeat/SKILL.md" >/dev/null \
  || fail "root plugin skill must use the canonical buildbeat name"
pass "plugin has one root skill and no top-level bin directory"

if [ -z "$CLAUDE_BIN" ]; then
  CLAUDE_BIN="$(command -v claude || true)"
fi
if [ -z "$CLAUDE_BIN" ] || [ ! -x "$CLAUDE_BIN" ]; then
  printf '%s\n' "SKIP: Claude Code CLI is unavailable; static marketplace checks passed ($ASSERTIONS assertions)"
  exit 0
fi

mkdir -p "$CONFIG_DIR" "$CACHE_DIR"

run_claude() {
  env \
    CLAUDE_CONFIG_DIR="$CONFIG_DIR" \
    CLAUDE_CODE_PLUGIN_CACHE_DIR="$CACHE_DIR" \
    "$CLAUDE_BIN" "$@"
}

run_claude plugin validate "$REPO_ROOT" --strict >/dev/null
run_claude plugin validate "$REPO_ROOT/plugins/buildbeat" --strict >/dev/null
pass "Claude Code strict validation accepts marketplace and plugin manifests"

run_claude plugin marketplace add "$REPO_ROOT" --scope user >/dev/null
run_claude plugin install buildbeat@buildbeat-plugins --scope user >/dev/null
run_claude plugin list --json >"$LIST_JSON"

INSTALL_PATH="$(python3 - "$LIST_JSON" "$CACHE_DIR" <<'PY'
import json
import sys
from pathlib import Path

plugins = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
matching = [item for item in plugins if item.get("id") == "buildbeat@buildbeat-plugins"]
assert len(matching) == 1
plugin = matching[0]
assert plugin.get("version") == "0.1.0"
assert plugin.get("scope") == "user"
assert plugin.get("enabled") is True

cache = Path(sys.argv[2]).resolve()
installed = Path(plugin["installPath"]).resolve()
installed.relative_to(cache)
print(installed)
PY
)"
pass "isolated marketplace add and plugin install return one enabled plugin"

[ -d "$INSTALL_PATH" ] || fail "installed plugin cache directory is missing"
for relative in SKILL.md CHANGELOG.md LICENSE lessons.md; do
  [ -f "$INSTALL_PATH/$relative" ] && [ ! -L "$INSTALL_PATH/$relative" ] \
    || fail "$relative was not dereferenced into a regular cached file"
done
for relative in templates docs example; do
  [ -d "$INSTALL_PATH/$relative" ] && [ ! -L "$INSTALL_PATH/$relative" ] \
    || fail "$relative was not dereferenced into a regular cached directory"
done
[ -f "$INSTALL_PATH/docs/CLI.md" ] \
  || fail "installed plugin is missing reference documentation"
[ -f "$INSTALL_PATH/example/README.md" ] \
  || fail "installed plugin is missing the teaching example"
[ ! -e "$INSTALL_PATH/bin" ] \
  || fail "installed plugin unexpectedly exposes the npm CLI bin directory"
if find "$INSTALL_PATH" -type l -print -quit | grep -q .; then
  fail "installed plugin cache still contains symbolic links"
fi
cmp -s "$REPO_ROOT/SKILL.md" "$INSTALL_PATH/SKILL.md" \
  || fail "installed root skill differs from the canonical SKILL.md"
cmp -s \
  "$REPO_ROOT/templates/standards/STACK.md" \
  "$INSTALL_PATH/templates/standards/STACK.md" \
  || fail "installed templates differ from the canonical repository source"
pass "cached plugin is self-contained, dereferenced, and excludes the CLI bin"

run_claude plugin validate "$INSTALL_PATH" --strict >/dev/null
pass "Claude Code strict validation accepts the installed cached plugin"

printf 'PASS: Claude plugin marketplace checks passed (%d assertions)\n' "$ASSERTIONS"
