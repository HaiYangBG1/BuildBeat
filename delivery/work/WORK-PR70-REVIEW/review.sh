#!/usr/bin/env bash
# Read-only reviewer for WORK-PR70-REVIEW. The delta is too large for one
# pass, so one codex pass per area runs in parallel and the answers are
# merged into the single envelope the kernel reads. Nothing is written inside
# the worktree; scratch output lives in TMPDIR. A missing tool, a failed pass
# or an unparseable answer exits 75 (infrastructure), never a clean review.
set -uo pipefail
dir="delivery/work/WORK-PR70-REVIEW/review"
for tool in codex node; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "review.sh: $tool not in PATH" >&2
    exit 75
  fi
done
scratch="$(mktemp -d "${TMPDIR:-/tmp}/bb-pr70-review.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT
input="${BUILDBEAT_INPUT:-}"
[ -n "$input" ] || input='{}'
areas=(runtime cli-compat docs-surface tests-package)
pids=()
for area in "${areas[@]}"; do
  {
    cat "$dir/common.md"
    printf '\n'
    cat "$dir/$area.md"
    printf '\nBUILDBEAT_INPUT (run context, prior findings and adjudications):\n%s\n' "$input"
  } >"$scratch/$area.prompt"
  codex exec -s read-only --color never -o "$scratch/$area.out" - \
    <"$scratch/$area.prompt" >"$scratch/$area.log" 2>&1 &
  pids+=("$!")
done
failed=0
for i in "${!areas[@]}"; do
  if ! wait "${pids[$i]}"; then
    echo "review.sh: ${areas[$i]} pass failed; last log lines:" >&2
    tail -n 20 "$scratch/${areas[$i]}.log" >&2
    failed=1
  fi
done
[ "$failed" -eq 0 ] || exit 75
if ! envelope="$(node "$dir/merge.mjs" "$scratch" "${areas[@]}")"; then
  exit 75
fi
if [ -n "${BUILDBEAT_OUTPUT:-}" ]; then
  printf '%s\n' "$envelope" >"$BUILDBEAT_OUTPUT"
fi
printf '%s\n' "$envelope"
