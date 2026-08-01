#!/usr/bin/env bash
# pre-commit.sh —— 红线机器闸。规则不能只靠自觉:每条规则问一句「违反了会怎样」,答案得是「拦下来」。
# 闸①:凭据不入 git(红线1)—— gitleaks 扫暂存区,报警即拦;未装 gitleaks 只警告不拦(装:brew install gitleaks)。
# 闸②:协调层可信 —— bus-check --strict 检出 腐烂/幽灵hash 即拦(离线模式,不查线上;仅 meta 仓生效,子仓自动跳过)。
# 装法(meta 仓 + 各代码子仓,每仓各装一次;子仓从 meta 仓拷同一份即可):
#   cp scripts/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
# 配套:红线3 已禁 --no-verify,这道闸绕不过去。
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

# ── 闸①:gitleaks(v8.19+ 用 `gitleaks git`,旧版退回 `protect`)──
if command -v gitleaks >/dev/null 2>&1; then
  if gitleaks git -h >/dev/null 2>&1; then
    gitleaks git --staged --no-banner --redact >/dev/null 2>&1
  else
    gitleaks protect --staged --no-banner --redact >/dev/null 2>&1
  fi || { echo "⛔ gitleaks 报警:疑似凭据进入暂存区,已拦截。看细节重跑:gitleaks git --staged(确认误报则登记 .gitleaksignore)"; exit 1; }
else
  echo "⚠️  未装 gitleaks —— 红线1(凭据不入 git)当前没有机器闸,只剩自觉。装:brew install gitleaks"
fi

# ── 闸②:bus-check --strict(只有 meta 仓同时有 pm/NOW.md 与 scripts/bus-check.sh)──
if [ -f pm/NOW.md ] && [ -f scripts/bus-check.sh ]; then
  out=$(BUS_CHECK_NO_FETCH=1 BUS_CHECK_NO_LIVE=1 bash scripts/bus-check.sh --strict 2>&1) || {
    printf '%s\n' "$out" | grep -E "⚠️|⛔"
    echo "⛔ bus-check --strict 未过 —— 全量输出看:bash scripts/bus-check.sh"
    exit 1
  }
fi
exit 0
