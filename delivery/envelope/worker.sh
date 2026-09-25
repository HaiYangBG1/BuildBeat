#!/usr/bin/env bash
# BuildBeat v2 worker 包装：把任意 CLI Agent 接进 Runner 的信封合同。
#
#   bash delivery/envelope/worker.sh <role> -- <tool command...>
#   role: builder | fixer | planner（写入步）  reviewer（只读步）
#
# 做的事（每一条都对应 docs/v2/guide/05-worker-contract.md 的一条合同）：
#   1. 工具不在 PATH → exit 75（EX_TEMPFAIL）：内核判基础设施故障停人，不派 fixer、不扣预算；
#   2. 有 $BUILDBEAT_PROMPT 就把 prompt 文本作为最后一个参数追加给工具（codex exec / claude -p 都吃位置参数）；
#   3. 写入步：工具返回后若工作树有改动，机械地 git add -A && git commit（提交动作不交给模型）；
#   4. 只读步：工具的 stdout 落到 $BUILDBEAT_OUTPUT（工具自己写了该文件则不覆盖）；不 commit；
#   5. 工具退出码原样透传；本脚本自己不判断候选好坏——那是 verify 与 review 的事。
# cwd 已由内核设为该步的隔离 worktree；不要 cd。
set -uo pipefail

role="${1:-}"
shift || true
if [ "${1:-}" = "--" ]; then
  shift
fi
if [ -z "$role" ] || [ "$#" -eq 0 ]; then
  echo "usage: worker.sh <builder|fixer|planner|reviewer> -- <tool command...>" >&2
  exit 64
fi

tool="$1"
if ! command -v "$tool" >/dev/null 2>&1; then
  echo "worker.sh: tool not found in PATH: $tool (exit 75 = infrastructure, not a candidate defect)" >&2
  exit 75
fi

input="${BUILDBEAT_INPUT:-{}}"
run_id="$(printf '%s' "$input" | sed -n 's/.*"runId":"\([^"]*\)".*/\1/p')"
attempt="$(printf '%s' "$input" | sed -n 's/.*"attempt":\([0-9]*\).*/\1/p')"

args=("$@")
if [ -n "${BUILDBEAT_PROMPT:-}" ] && [ -f "$BUILDBEAT_PROMPT" ]; then
  args+=("$(cat "$BUILDBEAT_PROMPT")")
fi

case "$role" in
  builder|fixer|planner)
    "${args[@]}"
    status=$?
    if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
      git add -A
      git -c user.name="${GIT_AUTHOR_NAME:-buildbeat-worker}" -c user.email="${GIT_AUTHOR_EMAIL:-worker@buildbeat.local}" \
        commit -q -m "${role}: ${run_id:-run} attempt ${attempt:-?}" || status=$?
    fi
    exit "$status"
    ;;
  reviewer)
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
    ;;
  *)
    echo "worker.sh: unknown role: $role" >&2
    exit 64
    ;;
esac
