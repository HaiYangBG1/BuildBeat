#!/usr/bin/env bash
# pre-commit.sh —— 红线机器闸。规则不能只靠自觉:每条规则问一句「违反了会怎样」,答案得是「拦下来」。
# 闸①:凭据不入 git(红线1)—— gitleaks 扫暂存区,报警即拦;未装 gitleaks 只警告不拦(装:brew install gitleaks)。
# 闸②:协调层可信 —— bus-check --strict 检出 腐烂/幽灵hash 即拦(离线模式,不查线上;仅 meta 仓生效,子仓自动跳过)。
# 闸③:状态分写(规则⑦)—— 一次 commit 暂存 ≥2 个域的 status 文件即拦(单会话=单域,不该同时写别人的;
#        换期压缩仪式例外:连同 pm/archive/ 一起提交即放行,或 BUS_RITUAL=1 git commit)。
# 闸④:不批量 stage(红线2)—— 暂存文件数 > BUS_MAX_STAGED(默认 40)即拦,像 `git add -A` 的手笔;
#        确属大重构:BUS_ALLOW_BULK=1 git commit 放行一次。
# 闸⑤:契约先落盘(规则②,仅提醒不拦)—— 暂存文件名疑似接口边界(route/controller/api/schema/proto)时,
#        提醒检查 PROTOCOL.md 是否同步;契约在 meta 仓、代码在子仓,跨仓无法原子核验,故不拦以免误伤。
# 装法(meta 仓 + 各代码子仓,每仓各装一次;子仓从 meta 仓拷同一份即可):
#   cp scripts/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
#   (紧凑布局下脚本在 pm/scripts/,拷贝源路径随之改;闸②两种布局都能自己找到 bus-check)
#   (钩子想进版本控制可改用:git config core.hooksPath <钩子目录>,克隆后一次 config 即带)
# 配套:红线3 已禁 --no-verify,这道闸绕不过去;bus-check 会自检「闸装了没」。
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

# ── 闸②:bus-check --strict(只有协调层仓同时有 pm/NOW.md 与 bus-check.sh;两种布局都认,见 SKILL §3)──
BC=""; for p in scripts/bus-check.sh pm/scripts/bus-check.sh; do [ -f "$p" ] && { BC="$p"; break; }; done
if [ -f pm/NOW.md ] && [ -n "$BC" ]; then
  out=$(BUS_CHECK_NO_FETCH=1 BUS_CHECK_NO_LIVE=1 bash "$BC" --strict 2>&1) || {
    printf '%s\n' "$out" | grep -E "⚠️|⛔"
    echo "⛔ bus-check --strict 未过 —— 全量输出看:bash $BC"
    exit 1
  }
fi

STAGED=$(git -c core.quotepath=false diff --cached --name-only)   # quotepath=false:中文文件名按原样输出,否则被引号+八进制转义,规则匹配不上

# ── 闸③:状态分写(规则⑦)—— 一次 commit 只该动一个域的 status ──
st_count=$(printf '%s\n' "$STAGED" | grep -c '^pm/status/.*\.md$' 2>/dev/null | tr -d ' ')
st_count=${st_count:-0}
if [ "$st_count" -ge 2 ] && [ "${BUS_RITUAL:-0}" != "1" ]; then
  # 排除 status/README.md 自身;换期压缩仪式(连同 archive/ 提交)放行
  real=$(printf '%s\n' "$STAGED" | grep '^pm/status/.*\.md$' | grep -v 'README\.md$' | wc -l | tr -d ' ')
  has_archive=$(printf '%s\n' "$STAGED" | grep -c '^pm/archive/' 2>/dev/null | tr -d ' ')
  if [ "${real:-0}" -ge 2 ] && [ "${has_archive:-0}" = "0" ]; then
    echo "⛔ 一次 commit 暂存了 $real 个域的 status(规则⑦:各域只写自己的)—— 分开提交;换期压缩仪式请连同 pm/archive/ 一起提交(或 BUS_RITUAL=1 git commit)"
    exit 1
  fi
fi

# ── 闸④:不批量 stage(红线2)——像 git add -A 的手笔即拦 ──
staged_n=$(printf '%s\n' "$STAGED" | grep -c . | tr -d ' ')
MAXN="${BUS_MAX_STAGED:-40}"
if [ "${staged_n:-0}" -gt "$MAXN" ] && [ "${BUS_ALLOW_BULK:-0}" != "1" ]; then
  echo "⛔ 暂存了 $staged_n 个文件(>$MAXN)—— 像 \`git add -A\`(红线2:只 stage 自己域的具体文件,多仓分别提交);确属大重构:BUS_ALLOW_BULK=1 git commit"
  exit 1
fi

# ── 闸⑤:契约先落盘(规则②,仅提醒)——只看**提供方**(Controller/路由/schema 定义) ──
# 消费方(src/api/ 等客户端调用层、前端页面 router)是「跟随契约」不是「改契约」,不提醒——
# 宽匹配在真实仓回放中 59% 提交误响,常驻红字=没有红字(评估 D2)。按项目调下面两个 env;
# 更精的收法(自行升级):只匹配 diff 内容里新增/删除的路由定义与 DTO 字段,或只在重轨提醒。
CONTRACT_HINT="${BUS_CONTRACT_HINT:-controller|endpoint|schema|\.proto|routes?/|router\.(go|py|rb|php|java|kt)}"
CONTRACT_SKIP="${BUS_CONTRACT_SKIP:-(^|/)api(s)?/|(^|/)src/router/|/client(s)?/|request}"
hint_hits=$(printf '%s\n' "$STAGED" | grep -iE "$CONTRACT_HINT" | grep -viE "$CONTRACT_SKIP" || true)
if [ -n "$hint_hits" ] && ! printf '%s\n' "$STAGED" | grep -q 'PROTOCOL\.md'; then
  echo "⚠️  暂存文件疑似动了接口**提供方**($(printf '%s\n' "$hint_hits" | head -1) 等)—— 跨边界行为变了的话,先改 contracts/PROTOCOL.md 再动代码(规则②;此为提醒不拦截)"
fi

exit 0
