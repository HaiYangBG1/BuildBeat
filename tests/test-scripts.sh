#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/solobaton-tests.XXXXXX")"
PROJECT=""
OUTPUT=""
STATUS=0
PROJECT_N=0
ASSERTIONS=0

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

expect_status() {
  expected="$1"
  label="$2"
  [ "$STATUS" -eq "$expected" ] || fail "$label (expected exit $expected, got $STATUS)"
  pass "$label"
}

expect_contains() {
  needle="$1"
  label="$2"
  printf '%s\n' "$OUTPUT" | grep -F -- "$needle" >/dev/null || fail "$label (missing: $needle)"
  pass "$label"
}

expect_not_contains() {
  needle="$1"
  label="$2"
  if printf '%s\n' "$OUTPUT" | grep -F -- "$needle" >/dev/null; then
    fail "$label (unexpected: $needle)"
  fi
  pass "$label"
}

new_project() {
  layout="${1:-default}"
  PROJECT_N=$((PROJECT_N + 1))
  PROJECT="$TMP_ROOT/project-$PROJECT_N"

  mkdir -p "$PROJECT/pm/status" "$PROJECT/pm/changes" "$PROJECT/contracts"
  if [ "$layout" = "compact" ]; then
    mkdir -p "$PROJECT/pm/scripts"
    cp "$REPO_ROOT"/templates/scripts/*.sh "$PROJECT/pm/scripts/"
    chmod +x "$PROJECT"/pm/scripts/*.sh
  else
    mkdir -p "$PROJECT/scripts"
    cp "$REPO_ROOT"/templates/scripts/*.sh "$PROJECT/scripts/"
    chmod +x "$PROJECT"/scripts/*.sh
  fi

  cat > "$PROJECT/pm/NOW.md" <<'EOF'
**当前期:测试期**
**本期轨道:标准轨**
- 当期看板: `测试期-看板.md`
EOF

  cat > "$PROJECT/pm/测试期-看板.md" <<'EOF'
# 测试期看板

- 当前工作包:回归测试
EOF

  cat > "$PROJECT/pm/decisions.md" <<'EOF'
# 决策台账
EOF

  cat > "$PROJECT/pm/status/README.md" <<'EOF'
# 状态分写约定
EOF

  cat > "$PROJECT/pm/changes/README.md" <<'EOF'
# 变更提案
EOF

  cat > "$PROJECT/contracts/PROTOCOL.md" <<'EOF'
# 契约

**契约快照对应版本:`test`**
EOF

  cat > "$PROJECT/.gitignore" <<'EOF'
.last-green-*
bus-baseline.json
EOF

  git -C "$PROJECT" init -q
  git -C "$PROJECT" config user.name "Solobaton Tests"
  git -C "$PROJECT" config user.email "tests@example.invalid"
  git -C "$PROJECT" add .
  git -C "$PROJECT" commit -qm "fixture baseline"
}

run_bus() {
  project="$1"
  script="$2"
  shift 2
  set +e
  OUTPUT=$(cd "$project" && BUS_CHECK_NO_FETCH=1 BUS_CHECK_NO_LIVE=1 bash "$script" "$@" 2>&1)
  STATUS=$?
  set -e
}

run_bus_with_now_limit() {
  project="$1"
  script="$2"
  limit="$3"
  set +e
  OUTPUT=$(cd "$project" && BUS_CHECK_NO_FETCH=1 BUS_CHECK_NO_LIVE=1 BUS_NOW_MAX="$limit" bash "$script" --strict 2>&1)
  STATUS=$?
  set -e
}

run_pre_commit() {
  project="$1"
  shift
  set +e
  OUTPUT=$(cd "$project" && "$@" bash scripts/pre-commit.sh 2>&1)
  STATUS=$?
  set -e
}

run_plain() {
  project="$1"
  shift
  set +e
  OUTPUT=$(cd "$project" && "$@" 2>&1)
  STATUS=$?
  set -e
}

printf '%s\n' 'Solobaton script regression suite'

new_project default
run_bus "$PROJECT" scripts/bus-check.sh --strict
expect_status 0 "clean default layout passes strict bus-check"
expect_contains "NOW 薄、看板归位、status 克制" "clean fixture reports a healthy coordination layer"

new_project default
printf '%s\n' extra-1 extra-2 extra-3 >> "$PROJECT/pm/NOW.md"
run_bus_with_now_limit "$PROJECT" scripts/bus-check.sh 4
expect_status 1 "bloated NOW fails strict bus-check"
expect_contains "协调层腐烂" "bloated NOW is classified as coordination-layer rot"

new_project default
printf '%s\n' "- candidate: \`deadbee1\`" > "$PROJECT/pm/status/fullstack.md"
run_bus "$PROJECT" scripts/bus-check.sh --strict
expect_status 1 "unresolvable status hash fails strict bus-check"
expect_contains "幽灵 hash" "unresolvable status hash is reported as a ghost hash"

new_project default
printf '%s\n' "- docs: \`https://example.invalid/abcdef1234567\` and prose \`defaced\`" > "$PROJECT/pm/status/fullstack.md"
run_bus "$PROJECT" scripts/bus-check.sh --strict
expect_status 0 "URL fragments and plain hex words do not trigger ghost-hash failures"

new_project default
printf '%s\n' "- mixed segment: \`https://example.invalid/abcdef1234567 deadbee1\`" > "$PROJECT/pm/status/fullstack.md"
run_bus "$PROJECT" scripts/bus-check.sh --strict
expect_status 1 "a ghost hash beside a URL is still detected"
expect_contains "deadbee1" "mixed URL segment preserves the real hash candidate"

new_project compact
run_bus "$PROJECT" pm/scripts/bus-check.sh --strict
expect_status 0 "compact pm/scripts layout passes strict bus-check"
expect_contains "协调层脚本: pm/scripts/" "compact layout resolves its script directory correctly"

new_project default
mkdir -p "$PROJECT/service one"
git -C "$PROJECT/service one" init -q
git -C "$PROJECT/service one" config user.name "Solobaton Tests"
git -C "$PROJECT/service one" config user.email "tests@example.invalid"
printf '%s\n' '# service' > "$PROJECT/service one/README.md"
git -C "$PROJECT/service one" add README.md
git -C "$PROJECT/service one" commit -qm "service baseline"
run_bus "$PROJECT" scripts/bus-check.sh --strict
expect_status 0 "sub-repository names with spaces do not break automatic discovery"
expect_contains "service one" "automatic discovery reports a sub-repository whose name contains spaces"

new_project default
printf '%s\n' '# product status' > "$PROJECT/pm/status/product.md"
printf '%s\n' '# testing status' > "$PROJECT/pm/status/testing.md"
git -C "$PROJECT" add pm/status/product.md pm/status/testing.md
run_pre_commit "$PROJECT" env BUS_CHECK_NO_FETCH=1 BUS_CHECK_NO_LIVE=1
expect_status 1 "pre-commit blocks one commit that writes multiple domain status files"
expect_contains "一次 commit 暂存了 2 个域的 status" "multi-status failure explains the write-boundary violation"

new_project default
printf '%s\n' '# product status' > "$PROJECT/pm/status/product.md"
printf '%s\n' '# testing status' > "$PROJECT/pm/status/testing.md"
mkdir -p "$PROJECT/pm/archive/测试期/evidence"
printf '%s\n' '# archived evidence' > "$PROJECT/pm/archive/测试期/evidence/report.md"
git -C "$PROJECT" add pm/status/product.md pm/status/testing.md pm/archive/测试期/evidence/report.md
run_pre_commit "$PROJECT" env BUS_CHECK_NO_FETCH=1 BUS_CHECK_NO_LIVE=1
expect_status 0 "iteration ritual may archive evidence and update multiple status files together"

new_project default
printf '%s\n' one > "$PROJECT/one.txt"
printf '%s\n' two > "$PROJECT/two.txt"
printf '%s\n' three > "$PROJECT/three.txt"
git -C "$PROJECT" add one.txt two.txt three.txt
run_pre_commit "$PROJECT" env BUS_MAX_STAGED=2 BUS_CHECK_NO_FETCH=1 BUS_CHECK_NO_LIVE=1
expect_status 1 "pre-commit blocks a staged set above the configured bulk limit"
expect_contains "像 \`git add -A\`" "bulk-stage failure explains the likely unsafe staging pattern"
run_pre_commit "$PROJECT" env BUS_MAX_STAGED=2 BUS_ALLOW_BULK=1 BUS_CHECK_NO_FETCH=1 BUS_CHECK_NO_LIVE=1
expect_status 0 "explicit BUS_ALLOW_BULK override permits a reviewed bulk change"

new_project default
mkdir -p "$PROJECT/server/controllers"
printf '%s\n' '# provider route' > "$PROJECT/server/controllers/user.sh"
git -C "$PROJECT" add server/controllers/user.sh
run_pre_commit "$PROJECT" env BUS_CHECK_NO_FETCH=1 BUS_CHECK_NO_LIVE=1
expect_status 0 "contract provider hint remains advisory"
expect_contains "疑似动了接口" "provider-side interface path emits a contract reminder"

new_project default
mkdir -p "$PROJECT/src/api"
printf '%s\n' '// consumer' > "$PROJECT/src/api/client.ts"
git -C "$PROJECT" add src/api/client.ts
run_pre_commit "$PROJECT" env BUS_CHECK_NO_FETCH=1 BUS_CHECK_NO_LIVE=1
expect_status 0 "client API consumer path does not block pre-commit"
expect_not_contains "疑似动了接口" "client API consumer path does not emit provider contract noise"

new_project default
mkdir -p "$PROJECT/test-bin"
cat > "$PROJECT/test-bin/gitleaks" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "git" ] && [ "${2:-}" = "-h" ]; then
  exit 0
fi
exit "${FAKE_GITLEAKS_EXIT:-0}"
EOF
chmod +x "$PROJECT/test-bin/gitleaks"
printf '%s\n' 'safe fixture content' > "$PROJECT/credential-check.txt"
git -C "$PROJECT" add credential-check.txt
run_pre_commit "$PROJECT" env PATH="$PROJECT/test-bin:$PATH" FAKE_GITLEAKS_EXIT=1 BUS_CHECK_NO_FETCH=1 BUS_CHECK_NO_LIVE=1
expect_status 1 "pre-commit blocks when the configured gitleaks scan reports a finding"
expect_contains "gitleaks 报警" "gitleaks failure reports the secret gate rather than a generic hook error"

new_project default
run_plain "$PROJECT" bash scripts/verify-status.sh --run
expect_status 0 "placeholder verify-status remains an honest non-blocking capability report"
expect_contains "SUITES 还是占位符" "placeholder verify-status explicitly reports missing L3 configuration"

new_project default
run_plain "$PROJECT" bash scripts/design-preview.sh 99
expect_status 1 "design preview fails when the requested rendered design does not exist"
expect_contains "找不到设计目录" "missing design failure names the expected directory"

new_project default
mkdir -p "$PROJECT/design/design_1期" "$PROJECT/test-bin"
printf '%s\n' '<!doctype html><title>fixture</title>' > "$PROJECT/design/design_1期/index page.html"
cat > "$PROJECT/test-bin/python3" <<'EOF'
#!/usr/bin/env bash
printf 'python3 %s\n' "$*"
EOF
chmod +x "$PROJECT/test-bin/python3"
run_plain "$PROJECT" env PATH="$PROJECT/test-bin:$PATH" bash scripts/design-preview.sh 1 9000
expect_status 0 "design preview accepts an HTML entry whose filename contains spaces"
expect_contains "index%20page.html" "design preview URL-encodes spaces in the HTML entry name"
expect_contains "--directory" "design preview passes the selected directory to the HTTP server"

if command -v jq >/dev/null 2>&1; then
  new_project default
  cat > "$PROJECT/scripts/live-config.sh" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
  chmod +x "$PROJECT/scripts/live-config.sh"
  printf '%s\n' '{"sentinel":true}' > "$PROJECT/scripts/bus-baseline.json"
  run_plain "$PROJECT" bash scripts/drift-check.sh --update-baseline
  expect_status 1 "failed live queries reject a baseline refresh"
  grep -F '"sentinel":true' "$PROJECT/scripts/bus-baseline.json" >/dev/null || fail "failed refresh overwrote the existing baseline"
  pass "failed baseline refresh preserves the previous baseline"

  cat > "$PROJECT/scripts/live-config.sh" <<'EOF'
#!/usr/bin/env bash
printf 'tag 1.0.0\n'
printf 'env FEATURE=%s\n' "${DRIFT_VALUE:-off}"
EOF
  chmod +x "$PROJECT/scripts/live-config.sh"
  run_plain "$PROJECT" env DRIFT_VALUE=off bash scripts/drift-check.sh --update-baseline
  expect_status 0 "successful live queries create a drift baseline"
  run_plain "$PROJECT" env DRIFT_VALUE=on bash scripts/drift-check.sh
  expect_status 2 "changed live configuration returns the documented drift exit code"
  expect_contains "env:[≠FEATURE]" "drift output names the changed key without printing its value"
  expect_not_contains "FEATURE=on" "drift output does not expose the live value"
else
  printf '%s\n' 'skip - drift baseline tests require jq'
fi

printf 'PASS: %s assertions\n' "$ASSERTIONS"
