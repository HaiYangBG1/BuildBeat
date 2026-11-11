#!/usr/bin/env bash
# Shell-level contract of the envelope wrapper shipped to users
# (templates/envelope/worker.sh), run on macOS (bash 3.2) and Linux in
# CI. Written for bash 3.2: no associative arrays, no mapfile.
set -uo pipefail

# The suite may itself run as a verifier of a BuildBeat review: what that
# review handed its worker must not reach the workers under test.
unset BUILDBEAT_OUTPUT BUILDBEAT_PROMPT BUILDBEAT_INPUT

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORKER="$REPO_ROOT/templates/envelope/worker.sh"
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
export BUILDBEAT_INPUT='{"workId":"WORK-T","runId":"RUN-T-01","step":"review","attempt":1}'

repo=$(new_repo usage)
check "no arguments is a usage error (64)" "$(run_worker "$repo")" 64
check "a role without a tool is a usage error (64)" "$(run_worker "$repo" reviewer)" 64
check "a tool missing from PATH is an infrastructure exit (75)" "$(run_worker "$repo" reviewer -- no-such-tool-for-buildbeat)" 75
check "the reader role runs the tool like the reviewer role" "$(run_worker "$repo" reader -- true)" 0
check "an unknown role is a usage error (64)" "$(run_worker "$repo" painter -- true)" 64
check "the writing roles of earlier versions are usage errors (64)" "$(run_worker "$repo" builder -- true)$(run_worker "$repo" fixer -- true)" 6464

repo=$(new_repo reviewer)
output="$TMP_ROOT/review.json"
status=$(BUILDBEAT_OUTPUT="$output" BUILDBEAT_PROMPT="$PROMPT" run_worker "$repo" reviewer -- stub-echo)
check "reviewer exits with the tool's status" "$status" 0
check "the prompt is passed as the last argument, and the tool's stdout becomes the output" "$(cat "$output")" "REVIEW: do the thing"
check "reviewer makes no commit" "$(git -C "$repo" log --format=%s | wc -l | tr -d ' ')" 1
check "reviewer leaves the checkout as it found it" "$(git -C "$repo" status --porcelain)" ""

rm -f "$output"
status=$(STUB_EXIT=5 BUILDBEAT_OUTPUT="$output" run_worker "$repo" reviewer -- stub-echo)
check "reviewer passes a failing tool status through" "$status" 5

rm -f "$output"
BUILDBEAT_OUTPUT="$output" run_worker "$repo" reviewer -- stub-selfwrite > /dev/null
check "reviewer keeps an output the tool wrote itself" "$(cat "$output")" '{"self":true}'

status=$(STUB_EXIT=7 run_worker "$repo" reviewer -- stub-echo)
check "without an output path the tool still runs and its status passes through" "$status" 7
check "without a prompt file nothing is appended" "$(cat "$TMP_ROOT/out.txt")" "REVIEW: "

if cmp -s "$WORKER" "$REPO_ROOT/example/delivery/envelope/worker.sh"; then
  ok "the example project's worker.sh is the template, byte for byte"
else
  not_ok "the example project's worker.sh differs from the template"
fi

# shellcheck disable=SC2016 # $BASH_VERSION must expand in the shell under test
echo "# $count checks, $failures failed ($("$BASH_UNDER_TEST" -c 'echo "bash $BASH_VERSION"'))"
[ "$failures" -eq 0 ]
