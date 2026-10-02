#!/usr/bin/env bash
# Shell-level contract of the envelope wrapper shipped to users
# (templates/v2/envelope/worker.sh), run on macOS (bash 3.2) and Linux in
# CI. Written for bash 3.2: no associative arrays, no mapfile.
set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORKER="$REPO_ROOT/templates/v2/envelope/worker.sh"
# The shell that runs worker.sh (run configs invoke it as `bash worker.sh`).
# CI pins /bin/bash on macOS, the bash 3.2 users get by default.
BASH_UNDER_TEST="${BASH_UNDER_TEST:-bash}"
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/buildbeat-envelope.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT

failures=0
count=0
ok() { count=$((count + 1)); echo "ok $count - $1"; }
not_ok() { count=$((count + 1)); failures=$((failures + 1)); echo "not ok $count - $1"; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else not_ok "$1 (expected [$3], got [$2])"; fi; }

# Stub tools on PATH. The prompt arrives as the last argument.
BIN="$TMP_ROOT/bin"
mkdir -p "$BIN"
cat > "$BIN/stub-write" <<'STUB'
#!/usr/bin/env bash
for last in "$@"; do :; done
printf '%s' "${last:-}" > made-by-stub.txt
exit "${STUB_EXIT:-0}"
STUB
cat > "$BIN/stub-echo" <<'STUB'
#!/usr/bin/env bash
for last in "$@"; do :; done
printf 'REVIEW: %s' "${last:-}"
exit "${STUB_EXIT:-0}"
STUB
cat > "$BIN/stub-selfwrite" <<'STUB'
#!/usr/bin/env bash
printf '{"self":true}' > "$BUILDBEAT_OUTPUT"
printf 'stdout text'
STUB
chmod +x "$BIN"/*
export PATH="$BIN:$PATH"

new_repo() {
  local dir="$TMP_ROOT/repo-$1"
  git init -q "$dir"
  git -C "$dir" -c user.name=T -c user.email=t@example.com commit -q --allow-empty -m base
  echo "$dir"
}

run_worker() {
  # run_worker <repo> <args...>; prints the exit status
  local dir="$1"
  shift
  (cd "$dir" && "$BASH_UNDER_TEST" "$WORKER" "$@" > "$TMP_ROOT/out.txt" 2> "$TMP_ROOT/err.txt")
  echo $?
}

PROMPT="$TMP_ROOT/prompt.md"
printf 'do the thing' > "$PROMPT"
export BUILDBEAT_INPUT='{"workId":"WORK-T","runId":"RUN-T-01","step":"build","attempt":2}'

repo=$(new_repo usage)
check "no arguments is a usage error (64)" "$(run_worker "$repo")" 64
check "a role without a tool is a usage error (64)" "$(run_worker "$repo" builder)" 64
check "a tool missing from PATH is an infrastructure exit (75)" "$(run_worker "$repo" builder -- no-such-tool-for-buildbeat)" 75
check "an unknown role is a usage error (64)" "$(run_worker "$repo" painter -- true)" 64

repo=$(new_repo builder)
status=$(BUILDBEAT_PROMPT="$PROMPT" run_worker "$repo" builder -- stub-write)
check "builder exits with the tool's status" "$status" 0
check "the prompt is passed as the last argument" "$(cat "$repo/made-by-stub.txt")" "do the thing"
check "builder commits its changes mechanically" "$(git -C "$repo" log -1 --format=%s)" "builder: RUN-T-01 attempt 2"
check "builder leaves a clean worktree" "$(git -C "$repo" status --porcelain)" ""

repo=$(new_repo fixer)
status=$(STUB_EXIT=3 BUILDBEAT_PROMPT="$PROMPT" run_worker "$repo" fixer -- stub-write)
check "fixer passes a failing tool status through" "$status" 3
check "fixer still commits what the tool changed" "$(git -C "$repo" log -1 --format=%s)" "fixer: RUN-T-01 attempt 2"

repo=$(new_repo quiet)
before=$(git -C "$repo" rev-parse HEAD)
check "a writing step with no changes exits 0" "$(run_worker "$repo" builder -- true)" 0
check "a writing step with no changes makes no commit" "$(git -C "$repo" rev-parse HEAD)" "$before"

repo=$(new_repo reviewer)
output="$TMP_ROOT/review.json"
status=$(BUILDBEAT_OUTPUT="$output" BUILDBEAT_PROMPT="$PROMPT" run_worker "$repo" reviewer -- stub-echo)
check "reviewer exits with the tool's status" "$status" 0
check "reviewer captures the tool's stdout as its output" "$(cat "$output")" "REVIEW: do the thing"
check "reviewer makes no commit" "$(git -C "$repo" log --format=%s | wc -l | tr -d ' ')" 1

rm -f "$output"
status=$(STUB_EXIT=5 BUILDBEAT_OUTPUT="$output" run_worker "$repo" reviewer -- stub-echo)
check "reviewer passes a failing tool status through" "$status" 5

rm -f "$output"
BUILDBEAT_OUTPUT="$output" run_worker "$repo" reviewer -- stub-selfwrite > /dev/null
check "reviewer keeps an output the tool wrote itself" "$(cat "$output")" '{"self":true}'

if cmp -s "$WORKER" "$REPO_ROOT/example/delivery/envelope/worker.sh"; then
  ok "the example project's worker.sh is the template, byte for byte"
else
  not_ok "the example project's worker.sh differs from the template"
fi

# shellcheck disable=SC2016 # $BASH_VERSION must expand in the shell under test
echo "# $count checks, $failures failed ($("$BASH_UNDER_TEST" -c 'echo "bash $BASH_VERSION"'))"
[ "$failures" -eq 0 ]
