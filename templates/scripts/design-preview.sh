#!/usr/bin/env bash
# design-preview.sh —— Gate2 真渲染拍板(总线规则⑩)。
# 把 design/design_<N>期/ 起成本地静态服务,用户在浏览器点过关键流之后再拍板;
# 静态稿 / 截图不充当拍板对象。设计走查复核时同样可用。
# 本脚本按自身位置定位协调层根,放 <根>/scripts/ 或 <根>/pm/scripts/ 均可(紧凑布局见 SKILL §3);下文命令示例按默认布局写。
# 用法:
#   bash scripts/design-preview.sh 1           # 渲染 design/design_1期 → http://localhost:8799
#   bash scripts/design-preview.sh 2 8801      # 指定端口
#   bash scripts/design-preview.sh design_2期   # 也接受完整目录名
set -uo pipefail
# 协调层根 = 向上最近的含 pm/NOW.md 的目录(设计稿在 <根>/design/);SDIR 只用于把用法提示打成实际路径。见 bus-check.sh 同段注释。
_sd="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$_sd"; for _ in 1 2 3 4; do [ -f "$ROOT/pm/NOW.md" ] && break; ROOT="$(dirname "$ROOT")"; done
[ -f "$ROOT/pm/NOW.md" ] || ROOT="$(cd "$_sd/.." && pwd)"
SDIR="${_sd#"$ROOT"/}"; [ "$SDIR" = "$_sd" ] && SDIR="."

N="${1:?用法: bash $SDIR/design-preview.sh <期号|目录名> [端口,默认 8799]}"
PORT="${2:-8799}"

DIR="$ROOT/design/design_${N}期"
[ -d "$DIR" ] || DIR="$ROOT/design/$N"
if [ ! -d "$DIR" ]; then
  echo "✗ 找不到设计目录: design/design_${N}期 或 design/$N" >&2
  echo "  现有:"
  existing_n=0
  for existing in "$ROOT"/design/design_*; do
    [ -d "$existing" ] || continue
    printf '  - %s\n' "${existing#"$ROOT"/}"
    existing_n=$((existing_n + 1))
  done
  [ "$existing_n" -gt 0 ] || echo "  (无)"
  exit 1
fi

ENTRY=""
for candidate in "$DIR"/*.html; do
  [ -f "$candidate" ] || continue
  ENTRY="$candidate"
  break
done
echo "▸ 渲染 ${DIR#"$ROOT"/} → http://localhost:$PORT/"
[ -n "${ENTRY:-}" ] && echo "▸ 入口: http://localhost:$PORT/$(basename "$ENTRY" | sed 's/ /%20/g')"
echo "▸ Gate2 拍板前:浏览器里把关键流点一遍(规则⑩)。Ctrl-C 停止。"
exec python3 -m http.server "$PORT" --directory "$DIR"
