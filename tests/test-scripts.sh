#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/buildbeat-tests.XXXXXX")"
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
  git -C "$PROJECT" config user.name "BuildBeat Tests"
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

run_bus_json() {
  project="$1"
  script="$2"
  ref_max="${3:-}"
  set +e
  if [ -n "$ref_max" ]; then
    OUTPUT=$(cd "$project" && BUS_CHECK_NO_FETCH=1 BUS_CHECK_NO_LIVE=1 BUS_REF_MAX="$ref_max" bash "$script" --format=json --strict 2>&1)
  else
    OUTPUT=$(cd "$project" && BUS_CHECK_NO_FETCH=1 BUS_CHECK_NO_LIVE=1 bash "$script" --format=json --strict 2>&1)
  fi
  STATUS=$?
  set -e
}

run_bus_fixture_human() {
  project="$1"
  script="$2"
  ref_max="${3:-}"
  if [ -z "$ref_max" ]; then
    run_bus "$project" "$script" --strict
    return
  fi
  set +e
  OUTPUT=$(cd "$project" && BUS_CHECK_NO_FETCH=1 BUS_CHECK_NO_LIVE=1 BUS_REF_MAX="$ref_max" bash "$script" --strict 2>&1)
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

fixture_value() {
  manifest="$1"
  key="$2"
  python3 - "$manifest" "$key" <<'PY'
import json
import sys

value = json.loads(open(sys.argv[1], encoding="utf-8").read())
for part in sys.argv[2].split("."):
    value = value[part]
if isinstance(value, list):
    for item in value:
        print(item)
else:
    print(value)
PY
}

validate_fixture_manifest() {
  manifest="$1"
  if ! python3 - "$manifest" <<'PY'
import json
import re
import sys

data = json.loads(open(sys.argv[1], encoding="utf-8").read())
assert data.get("schemaVersion") == 1
if "extends" in data:
    assert data["extends"] == "healthy-default"
codes = data.get("expectedCodes")
assert isinstance(codes, list)
assert all(isinstance(code, str) and re.fullmatch(r"[a-z]+(?:\.[a-z0-9_]+)+", code) for code in codes)
assert len(codes) == len(set(codes))
assert data.get("expectedCoverageComplete") in (True, False)
json_result = data.get("json")
assert isinstance(json_result, dict)
assert json_result.get("strictExit") in (0, 1)
legacy = data.get("legacy")
assert isinstance(legacy, dict)
assert legacy.get("strictExit") in (0, 1)
for key in ("contains", "notContains"):
    assert isinstance(legacy.get(key), list)
    assert all(isinstance(item, str) and item for item in legacy[key])
env = data.get("env", {})
assert isinstance(env, dict)
assert set(env).issubset({"BUS_REF_MAX"})
if "BUS_REF_MAX" in env:
    assert isinstance(env["BUS_REF_MAX"], int) and env["BUS_REF_MAX"] >= 0
PY
  then
    fail "invalid fixture manifest: $manifest"
  fi
}

load_fixture() {
  name="$1"
  PROJECT_N=$((PROJECT_N + 1))
  PROJECT="$TMP_ROOT/project-$PROJECT_N"
  fixture_root="$REPO_ROOT/tests/fixtures/$name"

  [ -d "$fixture_root/project" ] || fail "fixture project is missing: $name"
  [ -f "$fixture_root/expected-findings.json" ] || fail "fixture findings are missing: $name"
  mkdir -p "$PROJECT/scripts"
  fixture_base="$(fixture_value "$fixture_root/expected-findings.json" extends 2>/dev/null || true)"
  if [ -n "$fixture_base" ]; then
    [ -d "$REPO_ROOT/tests/fixtures/$fixture_base/project" ] || fail "fixture base is missing: $fixture_base"
    cp -R "$REPO_ROOT/tests/fixtures/$fixture_base/project/." "$PROJECT/"
  fi
  cp -R "$fixture_root/project/." "$PROJECT/"
  cp "$REPO_ROOT"/templates/scripts/*.sh "$PROJECT/scripts/"
  chmod +x "$PROJECT"/scripts/*.sh

  git -C "$PROJECT" init -q
  git -C "$PROJECT" config user.name "BuildBeat Tests"
  git -C "$PROJECT" config user.email "tests@example.invalid"
  git -C "$PROJECT" add .
  git -C "$PROJECT" commit -qm "fixture baseline"
}

run_fixture() {
  name="$1"
  manifest="$REPO_ROOT/tests/fixtures/$name/expected-findings.json"
  validate_fixture_manifest "$manifest"
  pass "$name fixture manifest matches schema 1"
  load_fixture "$name"
  ref_max="$(fixture_value "$manifest" env.BUS_REF_MAX 2>/dev/null || true)"
  run_bus_fixture_human "$PROJECT" scripts/bus-check.sh "$ref_max"
  expected_status="$(fixture_value "$manifest" legacy.strictExit)"
  expect_status "$expected_status" "$name fixture returns its declared legacy strict exit"
  while IFS= read -r needle; do
    [ -n "$needle" ] || continue
    expect_contains "$needle" "$name fixture includes declared legacy output: $needle"
  done < <(fixture_value "$manifest" legacy.contains)
  while IFS= read -r needle; do
    [ -n "$needle" ] || continue
    expect_not_contains "$needle" "$name fixture excludes declared legacy output: $needle"
  done < <(fixture_value "$manifest" legacy.notContains)

  run_bus_json "$PROJECT" scripts/bus-check.sh "$ref_max"
  expected_json_status="$(fixture_value "$manifest" json.strictExit)"
  expect_status "$expected_json_status" "$name JSON strict result matches its declared exit"
  if ! ACTUAL_JSON="$OUTPUT" python3 - "$manifest" <<'PY'
import json
import os
import sys

manifest = json.loads(open(sys.argv[1], encoding="utf-8").read())
report = json.loads(os.environ["ACTUAL_JSON"])

registry = {
    "sync.now_bloated": "conflict",
    "sync.ghost_hash": "conflict",
    "sync.production_drift": "conflict",
    "sync.l3_stale": "warning",
    "sync.l3_unconfigured": "unverified",
    "sync.scan_truncated": "unverified",
    "sync.unverified": "unverified",
    "gate.line_missing": "warning",
    "gate.na_without_reason": "conflict",
    "gate.pass_untraceable": "warning",
    "gate.invalid": "error",
    "evidence.missing": "conflict",
    "ref.broken": "conflict",
    "standards.invalid": "error",
    "standards.unconfirmed": "unverified",
    "stack.drift": "conflict",
    "stack.unverified": "unverified",
    "adr.status_invalid": "error",
    "adr.superseded_broken": "conflict",
}

assert report["schemaVersion"] == 1
assert report["command"] == "bus-check"
assert report["target"] == "."
assert report["strict"]["enabled"] is True
assert report["strict"]["blocked"] is bool(manifest["json"]["strictExit"])
assert report["coverage"]["complete"] is manifest["expectedCoverageComplete"]

levels = ("confirmed", "warning", "unverified", "conflict", "error")
counts = {level: 0 for level in levels}
actual_codes = []
for finding in report["findings"]:
    code = finding["code"]
    level = finding["level"]
    assert code in registry, code
    assert registry[code] == level, (code, level)
    assert finding.get("message")
    path = finding.get("path")
    assert path is None or (not path.startswith("/") and ".." not in path.split("/")), path
    counts[level] += 1
    if code not in actual_codes:
        actual_codes.append(code)

assert actual_codes == manifest["expectedCodes"], (actual_codes, manifest["expectedCodes"])
assert report["summary"] == counts, (report["summary"], counts)
assert report["ok"] is not bool(counts["conflict"] or counts["error"])
expected_reasons = []
for finding in report["findings"]:
    if finding["level"] == "unverified" and finding["code"] not in expected_reasons:
        expected_reasons.append(finding["code"])
assert report["coverage"]["reasons"] == expected_reasons
PY
  then
    fail "$name JSON report violates the finding schema or expected result"
  fi
  pass "$name JSON report matches codes, levels, counts, coverage, and paths"
}

printf '%s\n' 'BuildBeat script regression suite'

run_fixture healthy-default
run_fixture broken-now-pointer
run_fixture board-done-no-evidence
run_fixture gate-na-no-reason
run_fixture gate-pass-untraceable
run_fixture gate-invalid
run_fixture evidence-valid
run_fixture ghost-hash
run_fixture stale-now
run_fixture scan-truncated
run_fixture standards-partial
run_fixture standards-valid
run_fixture standards-draft
run_fixture standards-invalid
run_fixture stack-valid
run_fixture stack-conflict
run_fixture stack-unverified
run_fixture adr-valid
run_fixture adr-status-invalid
run_fixture adr-superseded-broken

PROJECT_N=$((PROJECT_N + 1))
PROJECT="$TMP_ROOT/project-$PROJECT_N"
cp -R "$REPO_ROOT/example/." "$PROJECT/"
mkdir -p "$PROJECT/scripts"
cp "$REPO_ROOT"/templates/scripts/*.sh "$PROJECT/scripts/"
chmod +x "$PROJECT"/scripts/*.sh
git -C "$PROJECT" init -q
git -C "$PROJECT" config user.name "BuildBeat Tests"
git -C "$PROJECT" config user.email "tests@example.invalid"
git -C "$PROJECT" add .
git -C "$PROJECT" commit -qm "example baseline"
run_bus_json "$PROJECT" scripts/bus-check.sh
expect_status 1 "teaching example still blocks only on its intentional negative evidence"
if ! ACTUAL_JSON="$OUTPUT" python3 - <<'PY'
import json
import os

report = json.loads(os.environ["ACTUAL_JSON"])
assert sum(item["code"] == "sync.ghost_hash" for item in report["findings"]) == 11
blocking = [item for item in report["findings"] if item["level"] in ("conflict", "error")]
assert len(blocking) == 11
assert all(item["code"] == "sync.ghost_hash" for item in blocking)
assert not any(
    item["code"].startswith(("standards.", "adr."))
    for item in report["findings"]
)
assert sum(item["code"] == "stack.unverified" for item in report["findings"]) == 1
PY
then
  fail "teaching example optional standards or ADR failed structural validation"
fi
pass "teaching example optional standards and ADR are structurally clean"

new_project default
printf '%s\n' extra-1 extra-2 extra-3 >> "$PROJECT/pm/NOW.md"
run_bus_with_now_limit "$PROJECT" scripts/bus-check.sh 4
expect_status 1 "bloated NOW fails strict bus-check"
expect_contains "协调层腐烂" "bloated NOW is classified as coordination-layer rot"

new_project default
for ((line_n=1; line_n<=41; line_n++)); do printf 'extra-%s\n' "$line_n" >> "$PROJECT/pm/NOW.md"; done
run_bus "$PROJECT" scripts/bus-check.sh --format=json
expect_status 0 "non-strict JSON produces a report even when a conflict exists"
expect_contains '"ok": false' "non-strict JSON still records the conflict in ok"
expect_contains '"strict": {"enabled":false,"blocked":false}' "non-strict JSON does not pretend strict blocking was enabled"
run_bus "$PROJECT" scripts/bus-check.sh
expect_status 0 "default human mode remains a report and does not block on findings"
run_bus "$PROJECT" scripts/bus-check.sh --format=yaml
expect_status 2 "an unsupported bus-check argument uses the documented usage exit"

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

new_project default
printf '%s\n' '# installed marker' > "$PROJECT/BUILDBEAT.md"
# shellcheck disable=SC2016 # backticks are literal Markdown delimiters
printf '%s\n' '- root marker: `BUILDBEAT.md`' '- status family: `status/*.md`' >> "$PROJECT/pm/NOW.md"
run_bus "$PROJECT" scripts/bus-check.sh --strict
expect_status 0 "scoped references accept an existing root fallback and ignore wildcard prose"
# shellcheck disable=SC2016 # backticks are literal Markdown delimiters
printf '%s\n' '- unsafe traversal: `../contracts/PROTOCOL.md`' >> "$PROJECT/pm/NOW.md"
run_bus "$PROJECT" scripts/bus-check.sh --strict
expect_status 1 "scoped references reject traversal syntax even when its target exists"
expect_contains "../contracts/PROTOCOL.md" "traversal failure reports the unsafe scoped token"

new_project default
cat > "$PROJECT/pm/decisions.md" <<'EOF'
# 决策台账
| 2026-08-24 | A | latest 1 `pm/decisions.md` |
| 2026-08-23 | A | latest 2 `pm/decisions.md` |
| 2026-08-22 | A | latest 3 `pm/decisions.md` |
| 2026-08-21 | A | archived shorthand `pm/missing-historical.md` |
EOF
run_bus "$PROJECT" scripts/bus-check.sh --strict
expect_status 0 "decision reference scan is bounded to the latest three dated rows"
cat > "$PROJECT/pm/decisions.md" <<'EOF'
# 决策台账
| 2026-08-24 | A | broken current pointer `pm/missing-current.md` |
| 2026-08-23 | A | latest 2 `pm/decisions.md` |
| 2026-08-22 | A | latest 3 `pm/decisions.md` |
EOF
run_bus "$PROJECT" scripts/bus-check.sh --strict
expect_status 1 "a broken reference in the latest decision window blocks strict mode"
expect_contains "pm/missing-current.md" "current decision reference failure names the broken token"

new_project compact
run_bus "$PROJECT" pm/scripts/bus-check.sh --strict
expect_status 0 "compact pm/scripts layout passes strict bus-check"
expect_contains "协调层脚本: pm/scripts/" "compact layout resolves its script directory correctly"

new_project default
mkdir -p "$PROJECT/service one"
git -C "$PROJECT/service one" init -q
git -C "$PROJECT/service one" config user.name "BuildBeat Tests"
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
run_plain "$PROJECT" bash scripts/verify-status.sh --format=machine
expect_status 0 "placeholder verify-status returns a machine-readable capability report"
expect_contains $'FINDING\tsync.l3_unconfigured\tunverified\t' "machine report exposes unconfigured L3 as unverified"
expect_not_contains "SUITES 还是占位符" "machine report does not mix in human dashboard prose"

perl -0pi -e 's/SUITES=\(\n.*?\n\)/SUITES=(\n  "unit|false"\n)/s' "$PROJECT/scripts/verify-status.sh"
run_plain "$PROJECT" bash scripts/verify-status.sh --run
expect_status 1 "verify-status --run returns non-zero when a configured suite fails"
expect_contains "unit 未过" "failed verify-status run identifies the failing suite"
perl -0pi -e 's/unit\|false/unit|true/' "$PROJECT/scripts/verify-status.sh"
printf '%s\n' '2000-01-01 00:00' > "$PROJECT/scripts/.last-green-unit"
run_plain "$PROJECT" env BUS_L3_MAX_AGE_DAYS=7 bash scripts/verify-status.sh --format=machine
expect_status 0 "configured stale L3 suite still produces a trustworthy machine report"
expect_contains $'FINDING\tsync.l3_stale\twarning\t' "machine report exposes stale L3 evidence as a warning"

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
