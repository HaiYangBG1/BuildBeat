#!/usr/bin/env bash
# verify-status.sh —— 工程层验证能力(证据分级 L3「自动化测试过」的兜底;bus-check §2.7 自动调用)
# 本脚本按自身位置定位协调层根,放 <根>/scripts/ 或 <根>/pm/scripts/ 均可(紧凑布局见 SKILL §3);下文命令示例按默认布局写。
# 两种用法:
#   bash scripts/verify-status.sh        # 打印各套件状态:套件 | 命令 | 上次全绿时间(bus-check 调的是这个)
#   bash scripts/verify-status.sh --run  # 逐套件真跑;全绿的套件记录「上次全绿时间」到标记文件
# 接入:改 SUITES 数组即可(名称|命令;命令里自己 cd 进子仓)。标记文件 .last-green-<套件>(与本脚本同目录)
# 是本地实查产物,不入 git(gitignore.template 已排除)——新机器上显示"从未全绿"是诚实的:你确实没在这台机器跑过。
set -uo pipefail
# 协调层根 = 向上最近的含 pm/NOW.md 的目录;SDIR = 本脚本目录(相对根)。见 bus-check.sh 同段注释。
_sd="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$_sd"; for _ in 1 2 3 4; do [ -f "$ROOT/pm/NOW.md" ] && break; ROOT="$(dirname "$ROOT")"; done
[ -f "$ROOT/pm/NOW.md" ] || ROOT="$(cd "$_sd/.." && pwd)"
SDIR="${_sd#"$ROOT"/}"; [ "$SDIR" = "$_sd" ] && SDIR="."
cd "$ROOT" || exit 1

# 套件表:名称|命令(示例:npm / mvn 各一,按项目替换;没有测试就留占位符,bus-check 会如实红字)
SUITES=(
  "<套件1>|cd <代码子仓1> && npm test --silent"
  "<套件2>|cd <代码子仓2> && mvn -q test"
)

RUN=0; [ "${1:-}" = "--run" ] && RUN=1
n=0; ph_warned=0
for pair in "${SUITES[@]:-}"; do
  [ -n "$pair" ] || continue
  case "$pair" in *"<"*)
    [ "$ph_warned" = 1 ] || echo "⚠️  SUITES 还是占位符 —— 填入真实测试命令,L3 级证据才有兜底(没有测试?先补,见 SKILL §8.5 第 3 步)"
    ph_warned=1; continue;; esac
  n=$((n+1))
  name="${pair%%|*}"; cmd="${pair#*|}"
  mark="$SDIR/.last-green-$name"
  if [ "$RUN" = 1 ]; then
    echo "▸ 跑 $name:$cmd"
    if bash -c "$cmd"; then
      date '+%Y-%m-%d %H:%M' > "$mark"; echo "✅ $name 全绿 → 已记 $(cat "$mark")"
    else
      echo "❌ $name 未过 —— 修完再跑 --run 刷新「上次全绿」"
    fi
  else
    last="从未全绿(或没在本机跑过)"; [ -f "$mark" ] && last="$(cat "$mark")"
    printf '%s | %s | 上次全绿:%s\n' "$name" "$cmd" "$last"
  fi
done
[ "$n" = 0 ] && [ "$RUN" = 1 ] && echo "(没有可跑的套件)"
exit 0
