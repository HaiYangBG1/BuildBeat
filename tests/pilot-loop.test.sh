#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
LOOP_SH="$REPO_ROOT/pilot/loop.sh"
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/buildbeat-pilot-loop.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT

passed=0
failed=0

pass() {
  passed=$((passed+1))
  printf 'ok - %s\n' "$1"
}

fail() {
  failed=$((failed+1))
  printf 'not ok - %s\n' "$1" >&2
}

assert_contains() {
  local haystack=$1 needle=$2 label=$3
  if [[ "$haystack" == *"$needle"* ]]; then
    pass "$label"
  else
    fail "$label (missing: $needle)"
  fi
}

setup_repo() {
  local project=$1 mode=$2 initial=${3:-broken}
  mkdir -p "$project/pilot-work/demo"
  git -C "$project" init -q
  git -C "$project" config user.name "BuildBeat Pilot Test"
  git -C "$project" config user.email "pilot@example.invalid"

  if [ "$initial" = fixed ]; then
    printf 'fixed\n' > "$project/app.txt"
  else
    printf 'broken\n' > "$project/app.txt"
  fi
  printf '# Intent\n\nMake app fixed.\n' > "$project/pilot-work/demo/intent.md"
  printf '# Plan\n\n- Status: Approved\n- Change app.txt only.\n' > "$project/pilot-work/demo/plan.md"
  printf 'accept.sh\n' > "$project/pilot-work/demo/protected-paths.txt"
  printf '#!/usr/bin/env bash\ngrep -q "^fixed$" app.txt\n' > "$project/accept.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$project/verify.sh"

  case "$mode" in
    success)
      # shellcheck disable=SC2016 # ${1:-} is literal content for the generated fixture script.
      printf '#!/usr/bin/env bash\ncase "${1:-}" in *fresh-context*) printf "no findings\\n" ;; *) printf "fixed\\n" > app.txt ;; esac\n' > "$project/agent.sh"
      ;;
    interrupt)
      # The verifier terminates its parent loop after the candidate changed. This
      # characterizes F5 without relying on timing or a platform-specific timeout.
      # shellcheck disable=SC2016 # ${1:-} and $PPID are literal fixture content.
      printf '#!/usr/bin/env bash\ncase "${1:-}" in *fresh-context*) printf "no findings\\n" ;; *) printf "fixed\\n" > app.txt ;; esac\n' > "$project/agent.sh"
      # shellcheck disable=SC2016 # $PPID is literal fixture content.
      printf '#!/usr/bin/env bash\nkill -TERM "$PPID"\nsleep 0.1\nexit 143\n' > "$project/verify.sh"
      ;;
    adapter-fail)
      printf '#!/usr/bin/env bash\nexit 7\n' > "$project/agent.sh"
      ;;
    protected-write)
      printf '#!/usr/bin/env bash\nprintf "#!/usr/bin/env bash\\nexit 0\\n" > accept.sh\nprintf "fixed\\n" > app.txt\n' > "$project/agent.sh"
      ;;
    reviewer-write)
      # shellcheck disable=SC2016 # ${1:-} is literal content for the generated fixture script.
      printf '#!/usr/bin/env bash\ncase "${1:-}" in *fresh-context*) printf "changed\\n" > review-touch.txt ;; *) printf "fixed\\n" > app.txt ;; esac\n' > "$project/agent.sh"
      ;;
    *)
      printf 'unknown mode: %s\n' "$mode" >&2
      return 1
      ;;
  esac

  chmod +x "$project/accept.sh" "$project/verify.sh" "$project/agent.sh"
  git -C "$project" add -- app.txt accept.sh verify.sh agent.sh pilot-work/demo/intent.md pilot-work/demo/plan.md pilot-work/demo/protected-paths.txt
  git -C "$project" commit -qm "test baseline"
  git -C "$project" switch -qc pilot/demo
}

run_loop() {
  local project=$1
  set +e
  LOOP_OUTPUT=$(cd "$project" && printf 'y\n' | \
    AGENT_CMD="$project/agent.sh" \
    REVIEW_AGENT_CMD="$project/agent.sh" \
    VERIFY_CMD="$project/verify.sh" \
    ACCEPT_CMD="$project/accept.sh" \
    bash "$LOOP_SH" pilot-work/demo 2>&1)
  LOOP_RC=$?
  set -e
}

project="$TMP_ROOT/success"
setup_repo "$project" success
run_loop "$project"
if [ "$LOOP_RC" -eq 0 ] && [ "$(tr -d '\n' < "$project/app.txt")" = fixed ]; then
  pass "successful loop reaches a fixed candidate"
else
  fail "successful loop reaches a fixed candidate (rc=$LOOP_RC)"
fi
assert_contains "$LOOP_OUTPUT" "WAITING_HUMAN" "successful loop stops before merge"
assert_contains "$LOOP_OUTPUT" "PASS_READONLY" "mandatory reviewer remains read-only"
approval_files=$(find "$project/pilot-work/demo/evidence" -maxdepth 1 -type f \
  \( -iname '*approval*' -o -iname '*decision*' \) -print)
if [ -z "$approval_files" ]; then
  pass "F6 characterization confirms no persisted merge approval object exists (capability MISSING)"
else
  fail "F6 characterization expected no persisted merge approval object (found: $approval_files)"
fi
printf 'changed-after-waiting-human\n' > "$project/app.txt"
if ! grep -q 'APPROVAL_STALE' "$project/pilot-work/demo/evidence/run.log"; then
  pass "F6 characterization confirms post-run candidate changes emit no stale event (capability MISSING)"
else
  fail "F6 characterization unexpectedly found an APPROVAL_STALE event"
fi

project="$TMP_ROOT/baseline-green"
setup_repo "$project" success fixed
run_loop "$project"
if [ "$LOOP_RC" -eq 2 ]; then
  pass "baseline-green acceptance blocks before agent execution"
else
  fail "baseline-green acceptance blocks before agent execution (rc=$LOOP_RC)"
fi
assert_contains "$LOOP_OUTPUT" "ACCEPT_CMD 在基线已经通过" "baseline false-green reason is explicit"

project="$TMP_ROOT/adapter-fail"
setup_repo "$project" adapter-fail
run_loop "$project"
if [ "$LOOP_RC" -eq 1 ]; then
  pass "adapter nonzero exit fails the run"
else
  fail "adapter nonzero exit fails the run (rc=$LOOP_RC)"
fi
assert_contains "$LOOP_OUTPUT" "adapter 在 build #1 异常退出" "adapter failure cannot be hidden by old green tests"

project="$TMP_ROOT/protected-write"
setup_repo "$project" protected-write
run_loop "$project"
if [ "$LOOP_RC" -eq 1 ]; then
  pass "protected acceptance oracle mutation blocks"
else
  fail "protected acceptance oracle mutation blocks (rc=$LOOP_RC)"
fi
assert_contains "$LOOP_OUTPUT" "agent 修改了受保护路径 accept.sh" "protected path is named"

project="$TMP_ROOT/reviewer-write"
setup_repo "$project" reviewer-write
run_loop "$project"
if [ "$LOOP_RC" -eq 1 ]; then
  pass "reviewer workspace mutation blocks"
else
  fail "reviewer workspace mutation blocks (rc=$LOOP_RC)"
fi
assert_contains "$LOOP_OUTPUT" "reviewer 修改了工作区" "reviewer write is detected by fingerprint"

project="$TMP_ROOT/interrupted-verify"
setup_repo "$project" interrupt
run_loop "$project"
interrupted_rc=$LOOP_RC
run_loop "$project"
if [ "$interrupted_rc" -ne 0 ] && [ "$LOOP_RC" -eq 2 ]; then
  pass "F5 interruption cannot silently restart from an ambiguous candidate"
else
  fail "F5 interruption cannot silently restart from an ambiguous candidate (first_rc=$interrupted_rc rerun_rc=$LOOP_RC)"
fi
assert_contains "$LOOP_OUTPUT" "开跑前工作树必须完全干净" "F5 rerun blocks because no recoverable checkpoint exists"

printf '%s passed, %s failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
