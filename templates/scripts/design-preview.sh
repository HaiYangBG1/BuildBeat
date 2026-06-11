#!/usr/bin/env bash
# design-preview.sh —— Gate2 真渲染拍板(总线规则⑩)。
# 把 design/design_<N>期/ 起成本地静态服务,用户在浏览器点过关键流之后再拍板;
# 静态稿 / 截图不充当拍板对象。设计走查复核时同样可用。
# 用法:
#   bash scripts/design-preview.sh 1           # 渲染 design/design_1期 → http://localhost:8799
#   bash scripts/design-preview.sh 2 8801      # 指定端口
#   bash scripts/design-preview.sh design_2期   # 也接受完整目录名
set -uo pipefail
N="${1:?用法: bash scripts/design-preview.sh <期号|目录名> [端口,默认 8799]}"
PORT="${2:-8799}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DIR="$ROOT/design/design_${N}期"
[ -d "$DIR" ] || DIR="$ROOT/design/$N"
if [ ! -d "$DIR" ]; then
  echo "✗ 找不到设计目录: design/design_${N}期 或 design/$N" >&2
  echo "  现有:"; ls -d "$ROOT"/design/design_* 2>/dev/null | sed "s|$ROOT/|  - |"
  exit 1
fi

ENTRY=$(ls "$DIR"/*.html 2>/dev/null | head -1)
echo "▸ 渲染 ${DIR#$ROOT/} → http://localhost:$PORT/"
[ -n "${ENTRY:-}" ] && echo "▸ 入口: http://localhost:$PORT/$(basename "$ENTRY" | sed 's/ /%20/g')"
echo "▸ Gate2 拍板前:浏览器里把关键流点一遍(规则⑩)。Ctrl-C 停止。"
exec python3 -m http.server "$PORT" --directory "$DIR"
