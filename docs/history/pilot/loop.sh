#!/usr/bin/env bash
# BuildBeat v2 · M-1 人肉内核试点驱动脚本
#
# 用法（必须在目标项目仓库根目录、pilot/* 专用分支运行）：
#   AGENT_CMD='claude -p' \
#   VERIFY_CMD='npm test' \
#   ACCEPT_CMD='npm test -- acceptance.test.js' \
#   bash /path/to/pilot/loop.sh pilot-work/<work-id>
#
# 命令变量按简单 argv 拆分，不解释管道、重定向或 shell 元字符；复杂命令请包成脚本再传路径。
# 本脚本不 merge、不 push、不部署。对这些动作的提示词约束仅为 ADVISORY；真正安全仍要求
# agent 无生产凭据、目标仓库低风险，并由宿主工具提供权限/网络限制。
set -uo pipefail

WORK_DIR="${1:?用法: loop.sh <work-dir>（需含已提交的 intent.md、plan.md、protected-paths.txt）}"
AGENT_CMD="${AGENT_CMD:?请设置 AGENT_CMD，如 'claude -p' 或 'cursor-agent -p'}"
REVIEW_AGENT_CMD="${REVIEW_AGENT_CMD:-$AGENT_CMD}"
VERIFY_CMD="${VERIFY_CMD:?请设置 VERIFY_CMD，如 'npm test'}"
ACCEPT_CMD="${ACCEPT_CMD:?请设置 ACCEPT_CMD；该验收命令必须在基线失败、实现后通过}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-4}"

case "$WORK_DIR" in
  /*|../*|*/../*|*/..)
    printf 'BLOCK: work-dir 必须是仓库内不含 .. 的相对路径\n' >&2
    exit 2
    ;;
esac

if ! [[ "$MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  printf 'BLOCK: MAX_ATTEMPTS 必须是正整数\n' >&2
  exit 2
fi

read -r -a AGENT_ARGV <<< "$AGENT_CMD"
read -r -a REVIEW_AGENT_ARGV <<< "$REVIEW_AGENT_CMD"
read -r -a VERIFY_ARGV <<< "$VERIFY_CMD"
read -r -a ACCEPT_ARGV <<< "$ACCEPT_CMD"

if [ "${#AGENT_ARGV[@]}" -eq 0 ] || [ "${#REVIEW_AGENT_ARGV[@]}" -eq 0 ] \
  || [ "${#VERIFY_ARGV[@]}" -eq 0 ] || [ "${#ACCEPT_ARGV[@]}" -eq 0 ]; then
  printf 'BLOCK: AGENT/REVIEW_AGENT/VERIFY/ACCEPT 命令不能为空\n' >&2
  exit 2
fi

if ! REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null); then
  printf 'BLOCK: 当前目录不在 Git 仓库中\n' >&2
  exit 2
fi
if [ "$(pwd -P)" != "$(cd "$REPO_ROOT" && pwd -P)" ]; then
  printf 'BLOCK: 请在目标项目仓库根目录运行\n' >&2
  exit 2
fi

CURRENT_BRANCH=$(git symbolic-ref --short -q HEAD || true)
case "$CURRENT_BRANCH" in
  pilot/*) ;;
  *)
    printf 'BLOCK: 当前分支必须是 pilot/* 专用分支，实际为 %s\n' "${CURRENT_BRANCH:-DETACHED}" >&2
    exit 2
    ;;
esac

for required in intent.md plan.md protected-paths.txt; do
  if [ ! -f "$WORK_DIR/$required" ]; then
    printf 'BLOCK: 缺 %s/%s（模板见 pilot/templates/）\n' "$WORK_DIR" "$required" >&2
    exit 2
  fi
  if ! git ls-files --error-unmatch -- "$WORK_DIR/$required" >/dev/null 2>&1; then
    printf 'BLOCK: %s/%s 必须先提交，确保批准对象固定\n' "$WORK_DIR" "$required" >&2
    exit 2
  fi
done

if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
  printf 'BLOCK: 开跑前工作树必须完全干净（含 untracked）；先提交试点工件或清理现场\n' >&2
  exit 2
fi

BASE=$(git rev-parse HEAD)
EVIDENCE_DIR="$WORK_DIR/evidence"
RUN_LOG="$EVIDENCE_DIR/run.log"
mkdir -p "$EVIDENCE_DIR"

log() { printf '%s | %s\n' "$(date '+%F %T')" "$*" | tee -a "$RUN_LOG"; }

PROTECTED_PATHS=("$WORK_DIR/intent.md" "$WORK_DIR/plan.md" "$WORK_DIR/protected-paths.txt")
while IFS= read -r protected; do
  case "$protected" in
    ''|'#'*) continue ;;
  esac
  PROTECTED_PATHS+=("$protected")
done < "$WORK_DIR/protected-paths.txt"

protected_path_changed=""
protected_paths_are_clean() {
  local protected untracked
  protected_path_changed=""
  for protected in "${PROTECTED_PATHS[@]}"; do
    if ! git diff --quiet "$BASE" -- "$protected"; then
      protected_path_changed="$protected"
      return 1
    fi
    untracked=$(git ls-files --others --exclude-standard -- "$protected")
    if [ -n "$untracked" ]; then
      protected_path_changed="$protected"
      return 1
    fi
  done
  return 0
}

workspace_fingerprint() {
  {
    git diff --binary "$BASE" --
    git status --porcelain=v1 --untracked-files=all
    while IFS= read -r untracked; do
      [ -f "$untracked" ] && shasum -a 256 "$untracked"
    done < <(git ls-files --others --exclude-standard)
  } | shasum -a 256 | awk '{print $1}'
}

log "RUN start | branch=$CURRENT_BRANCH | base=$BASE | agent=[$AGENT_CMD] | verify=[$VERIFY_CMD] | accept=[$ACCEPT_CMD] | max_attempts=$MAX_ATTEMPTS"
log "ENFORCEMENT: plan/intent/验收 oracle 受本地 diff 检查；push/deploy 等仍为 ADVISORY，宿主必须移除相应凭据和能力"

# 基线验收必须失败，否则后续绿色不能证明本工作项被实现。
"${ACCEPT_ARGV[@]}" > "$EVIDENCE_DIR/accept-baseline.log" 2>&1
baseline_accept_rc=$?
printf '%s\n' "$baseline_accept_rc" > "$EVIDENCE_DIR/accept-baseline.exit-code"
if [ "$baseline_accept_rc" -eq 0 ]; then
  log "BLOCK: ACCEPT_CMD 在基线已经通过，无法证明本工作项产生了行为变化"
  exit 2
fi
log "BASELINE acceptance = EXPECTED_FAIL (exit ${baseline_accept_rc})"

plan_digest=$(shasum -a 256 "$WORK_DIR/plan.md" | awk '{print $1}')
printf '你批准的 plan digest 是 %s 吗？[y/N] ' "$plan_digest"
read -r ok
if [ "${ok:-}" != y ]; then
  log "WAIT_HUMAN: plan 未批准，退出（批准后从干净基线重跑）"
  exit 0
fi
log "GATE plan-approval = PASS (human) | plan_digest=sha256:$plan_digest"

verdict=FAIL
attempt=0
while [ "$attempt" -lt "$MAX_ATTEMPTS" ]; do
  attempt=$((attempt+1))
  if [ "$attempt" -eq 1 ]; then
    stage=build
    prompt="读取 ${WORK_DIR}/intent.md 与 ${WORK_DIR}/plan.md，严格按批准范围实现。${WORK_DIR}/protected-paths.txt 中的验收 oracle 和控制工件只读。完成实现即停止。禁止运行 merge、部署、发布、push 或生产变更命令。"
  else
    stage=fix
    prompt="上一轮验证失败。读取 ${EVIDENCE_DIR}/verify-$((attempt-1)).log 与 ${EVIDENCE_DIR}/accept-$((attempt-1)).log，在批准范围内修复；protected-paths.txt 中的文件只读。禁止 merge、部署、发布、push 或生产变更。"
  fi

  agent_output=$(mktemp "${TMPDIR:-/tmp}/buildbeat-pilot-agent.XXXXXX")
  log "STEP $stage #$attempt: 调用 agent"
  "${AGENT_ARGV[@]}" "$prompt" 2>&1 | tee "$agent_output"
  agent_rc=${PIPESTATUS[0]}
  mv "$agent_output" "$EVIDENCE_DIR/$stage-$attempt.log"
  printf '%s\n' "$agent_rc" > "$EVIDENCE_DIR/$stage-$attempt.exit-code"
  if [ "$agent_rc" -ne 0 ]; then
    log "BLOCK: adapter 在 ${stage} #${attempt} 异常退出（exit ${agent_rc}），不得用后续旧测试绿色掩盖"
    exit 1
  fi

  if ! protected_paths_are_clean; then
    log "BLOCK: agent 修改了受保护路径 $protected_path_changed"
    exit 1
  fi

  git status --short --untracked-files=all > "$EVIDENCE_DIR/worktree-$attempt.txt" 2>&1 || true
  git diff --stat "$BASE" > "$EVIDENCE_DIR/diff-$attempt.txt" 2>&1 || true

  "${VERIFY_ARGV[@]}" > "$EVIDENCE_DIR/verify-$attempt.log" 2>&1
  verify_rc=$?
  printf '%s\n' "$verify_rc" > "$EVIDENCE_DIR/verify-$attempt.exit-code"
  "${ACCEPT_ARGV[@]}" > "$EVIDENCE_DIR/accept-$attempt.log" 2>&1
  accept_rc=$?
  printf '%s\n' "$accept_rc" > "$EVIDENCE_DIR/accept-$attempt.exit-code"

  if [ "$verify_rc" -eq 0 ] && [ "$accept_rc" -eq 0 ]; then
    log "VERIFY #$attempt = PASS | regression_exit=0 | acceptance_exit=0"
    verdict=PASS
    break
  fi
  log "VERIFY #$attempt = FAIL | regression_exit=$verify_rc | acceptance_exit=$accept_rc | 路由 fix"
done

if [ "$verdict" != PASS ]; then
  log "WAIT_HUMAN: 连续 $MAX_ATTEMPTS 轮未通过（预算上限）；登记卡点后人工判断"
  exit 1
fi

# 独立审查是 M-1 固定步骤；运行前后指纹不变才算只读。
before_review=$(workspace_fingerprint)
review_output=$(mktemp "${TMPDIR:-/tmp}/buildbeat-pilot-review.XXXXXX")
review_prompt="你是 fresh-context 只读审查者，禁止修改任何文件。对照 ${WORK_DIR}/intent.md、${WORK_DIR}/plan.md、git diff ${BASE} 与 git status --short（忽略 ${EVIDENCE_DIR}/ 运行日志），检查所有 tracked/untracked 候选变化，输出 P0/P1/P2 findings 和文件:行；无问题时明确说无。"
"${REVIEW_AGENT_ARGV[@]}" "$review_prompt" 2>&1 | tee "$review_output"
review_rc=${PIPESTATUS[0]}
after_review=$(workspace_fingerprint)
mv "$review_output" "$EVIDENCE_DIR/review.log"
printf '%s\n' "$review_rc" > "$EVIDENCE_DIR/review.exit-code"

if [ "$review_rc" -ne 0 ]; then
  log "BLOCK: reviewer adapter 异常退出（exit ${review_rc}）"
  exit 1
fi
if [ "$before_review" != "$after_review" ]; then
  log "BLOCK: reviewer 修改了工作区；before=$before_review after=$after_review"
  exit 1
fi

log "STEP review = PASS_READONLY | candidate_fingerprint=sha256:$before_review"
log "WAITING_HUMAN: 合并决定归你。先阅读 review.log 与全部证据；本脚本不 merge、不 push。"
log "RUN end | base=$BASE | attempts=$attempt | verdict=$verdict"
