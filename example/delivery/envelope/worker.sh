#!/usr/bin/env bash
# BuildBeat worker 包装：把任意 CLI Agent 接成只读审查者。
#
#   bash delivery/envelope/worker.sh reviewer -- <tool command...>
#   bash delivery/envelope/worker.sh reader -- <tool command...>    （读者测试，行为相同）
#
# 做的事（每一条都对应 docs/v2/guide/05-worker-contract.md 的一条合同）：
#   1. 工具不在 PATH → exit 75（EX_TEMPFAIL）：记为工具故障，不算这个提交的问题；
#   2. 有 $BUILDBEAT_PROMPT 就把 prompt 文本作为最后一个参数追加给工具（codex exec / claude -p 都吃位置参数）；
#   3. 工具的 stdout 落到 $BUILDBEAT_OUTPUT（工具自己写了该文件则不覆盖）；不改文件、不 commit；
#   4. 工具退出码原样透传；本脚本自己不判断提交好坏。
# cwd 已由内核设为这个提交的临时检出；不要 cd。
set -uo pipefail

role="${1:-}"
shift || true
if [ "${1:-}" = "--" ]; then
  shift
fi
if { [ "$role" != "reviewer" ] && [ "$role" != "reader" ]; } || [ "$#" -eq 0 ]; then
  echo "usage: worker.sh reviewer|reader -- <tool command...>" >&2
  exit 64
fi

tool="$1"
if ! command -v "$tool" >/dev/null 2>&1; then
  echo "worker.sh: tool not found in PATH: $tool (exit 75 = infrastructure, not a candidate defect)" >&2
  exit 75
fi

args=("$@")
if [ -n "${BUILDBEAT_PROMPT:-}" ] && [ -f "$BUILDBEAT_PROMPT" ]; then
  args+=("$(cat "$BUILDBEAT_PROMPT")")
fi

if [ -n "${BUILDBEAT_OUTPUT:-}" ]; then
  captured="$(mktemp "${TMPDIR:-/tmp}/bb-review.XXXXXX")"
  "${args[@]}" | tee "$captured"
  status=${PIPESTATUS[0]}
  if [ ! -s "$BUILDBEAT_OUTPUT" ]; then
    cp "$captured" "$BUILDBEAT_OUTPUT"
  fi
  rm -f "$captured"
  exit "$status"
fi
"${args[@]}"
exit $?
