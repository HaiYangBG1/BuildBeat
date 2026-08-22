#!/usr/bin/env bash
# drift-check.sh —— 生产漂移检测(治「git ≠ 生产」与平台侧 env/secret 漂移,solobaton lessons.md 第 13 条)
# 比对「部署平台当前配置(env 指纹 + 镜像/版本 tag)」vs 基线快照 bus-baseline.json(与本脚本同目录)。
# 本脚本按自身位置定位协调层根,放 <根>/scripts/ 或 <根>/pm/scripts/ 均可(紧凑布局见 SKILL §3);下文命令示例按默认布局写。
# ⚠ 能力边界:检测「平台配置 vs 基线」——把"配置被改"暴露出来,逼"改完即确认部署 + 刷基线";
#   不检测「running 容器 vs 平台配置」(配置改了没重新部署、容器跑旧值),后者需平台运行时 API,各项目自行增强。
# 🔴 红线:env value 只在内存进 sha256,**绝不落盘 / 绝不打印**;基线与输出只有 key 名 + 指纹。
#   诚实边界:高熵 secret 的指纹不可逆;低熵值(true/false/端口/开关类)key 名已知,可被字典猜出——
#   基线 bus-baseline.json 按半敏感文件对待:入私仓可以,勿公开传播。
#
# 项目接入点(必需):live-config.sh <app名>(与本脚本同目录)—— 自行调用部署平台 CLI,stdout 按行输出:
#     tag <镜像tag或版本号>          (可选,一行)
#     env <KEY>=<VALUE>             (每个环境变量一行;VALUE 只经内存管道,本脚本只留指纹)
#   查询失败请返回非 0,别输出半截结果。
# 用法:
#   bash scripts/drift-check.sh                   # 检测(与 bus-check 同目录时被自动调用)
#   bash scripts/drift-check.sh --update-baseline # 刷新基线(改 env/secret 或部署后跑 = 「确认已部署」动作)
#   BUS_CHECK_NO_LIVE=1 ...                        # 跳过线上查询
# 退出码:0 = 无漂移/跳过/无法判定;1 = --update-baseline 失败(基线保护);2 = 确凿检出漂移(bus-check --strict 据此拦)
set -uo pipefail
# 协调层根 = 向上最近的含 pm/NOW.md 的目录;SDIR = 本脚本目录(相对根)。见 bus-check.sh 同段注释。
_sd="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$_sd"; for _ in 1 2 3 4; do [ -f "$ROOT/pm/NOW.md" ] && break; ROOT="$(dirname "$ROOT")"; done
[ -f "$ROOT/pm/NOW.md" ] || ROOT="$(cd "$_sd/.." && pwd)"
SDIR="${_sd#"$ROOT"/}"; [ "$SDIR" = "$_sd" ] && SDIR="."
cd "$ROOT" || exit 1
BASELINE="$SDIR/bus-baseline.json"
UPDATE=0; [ "${1:-}" = "--update-baseline" ] && UPDATE=1

# 监控应用:app名|代码子仓(镜像tag↔git tag 锚定:在子仓 git 里查 v<tag> 是否存在;无 tag 规范填 - 跳过)
APPS=(
  "<应用1>|<代码子仓1>"
  "<应用2>|-"
)

if command -v sha256sum >/dev/null 2>&1; then SHACMD="sha256sum"; else SHACMD="shasum -a 256"; fi

# 拉某 app 当前快照 {imageTag, perKeyFp};value 只进 sha256 前 10 位;失败返回非 0
_snapshot(){
  local name="$1" out imgtag perkey
  out=$(bash "$SDIR/live-config.sh" "$name" 2>/dev/null) || return 1
  [ -z "$out" ] && return 1
  imgtag=$(printf '%s\n' "$out" | awk '$1=="tag"{print $2; exit}')
  perkey=$(printf '%s\n' "$out" | grep '^env ' | sed 's/^env //' \
    | while IFS='=' read -r k v; do printf '%s\t%s\n' "$k" "$(printf '%s' "$k=$v" | $SHACMD | cut -c1-10)"; done \
    | jq -R -s -c 'split("\n")|map(select(length>0)|split("\t")|{(.[0]):.[1]})|add // {}')
  [ -z "$perkey" ] && perkey='{}'  # env 空/解析失败→兜底{},不误报"查询失败"
  jq -cn --arg t "${imgtag:-}" --argjson pk "$perkey" '{imageTag:$t, perKeyFp:$pk}'
}

if [ "${BUS_CHECK_NO_LIVE:-0}" = "1" ] || [ ! -f "$SDIR/live-config.sh" ] || ! command -v jq >/dev/null 2>&1; then
  echo "  (漂移检测跳过:需 $SDIR/live-config.sh + jq + 不设 BUS_CHECK_NO_LIVE)"; exit 0
fi

# ── 刷新基线 ──
if [ "$UPDATE" = "1" ]; then
  acc="{}"; fail=0
  for pair in "${APPS[@]:-}"; do
    [ -n "$pair" ] || continue
    name="${pair%%|*}"
    snap=$(_snapshot "$name") || { echo "  ⚠️  $name 查询失败"; fail=1; continue; }
    acc=$(printf '%s' "$acc" | jq -c --arg n "$name" --argjson s "$snap" '. + {($n):$s}')
  done
  if [ "$fail" = "1" ]; then
    echo "  ✗ 有应用查询失败 —— 基线未写入(保留旧基线);修好平台 CLI/凭据后重跑 --update-baseline"
    exit 1
  fi
  printf '%s' "$acc" | jq --arg d "$(date +%Y-%m-%d)" --arg s "$SDIR" \
    '{updated:$d, note:("🔴只存指纹不存value;改env/secret或部署后跑 " + $s + "/drift-check.sh --update-baseline"), apps:.}' \
    > "$BASELINE"
  echo "  ✅ 基线已刷新 → $BASELINE"
  exit 0
fi

# ── 检测 ──
if [ ! -f "$BASELINE" ]; then
  echo "  ⚠️  无基线 → 先跑: bash $SDIR/drift-check.sh --update-baseline"; exit 0
fi

drift=0; checked=0
for pair in "${APPS[@]:-}"; do
  [ -n "$pair" ] || continue
  name="${pair%%|*}"; subrepo="${pair##*|}"
  snap=$(_snapshot "$name") || { printf "  %-16s (查询失败,跳过)\n" "$name"; continue; }
  checked=1
  imgtag=$(printf '%s' "$snap" | jq -r '.imageTag')
  base_app=$(jq -c --arg n "$name" '.apps[$n] // empty' "$BASELINE" 2>/dev/null)
  if [ -z "$base_app" ]; then printf "  ⚠️  %-16s 基线无此应用 → --update-baseline\n" "$name"; drift=1; continue; fi
  base_tag=$(printf '%s' "$base_app" | jq -r '.imageTag // ""')
  # env 漂移:并集 key 分类 ＋新增 －删除 ≠值变(只报 key 名,不报 value)
  changed=$(jq -rn \
    --argjson b "$(printf '%s' "$base_app" | jq '.perKeyFp')" \
    --argjson c "$(printf '%s' "$snap" | jq '.perKeyFp')" \
    '($b+$c|keys) | map(. as $k |
        if   $b[$k]==null then "＋"+$k
        elif $c[$k]==null then "－"+$k
        elif $b[$k]!=$c[$k] then "≠"+$k
        else empty end) | join(" ")')
  msg=""
  [ -n "$imgtag" ] && [ "$imgtag" != "$base_tag" ] && msg="$msg 镜像 $base_tag→$imgtag(新部署?)"
  [ -n "$changed" ] && msg="$msg env:[$changed]"
  gt=""
  if [ "$subrepo" != "-" ] && [ -d "$subrepo/.git" ] && [ -n "$imgtag" ]; then
    # 锚定假设「镜像 tag X ↔ git tag vX」;你的 tag 规范不同就改这一行
    git -C "$subrepo" rev-parse "v$imgtag" >/dev/null 2>&1 || gt=" 🏷git 无 v$imgtag(git≠生产?)"
  fi
  if [ -n "$msg" ] || [ -n "$gt" ]; then printf "  ⚠️  %-16s%s%s\n" "$name" "$msg" "$gt"; drift=1
  else printf "  ✅ %-16s 配置/镜像==基线 (tag %s)\n" "$name" "${imgtag:-?}"; fi
done
if [ "$checked" = "0" ]; then echo "  ⚠️  没有成功查到任何应用(APPS 为空或全部查询失败)—— 无法判定漂移,检查 APPS 配置/平台 CLI/凭据"; exit 0
elif [ "$drift" = "0" ]; then echo "  —— 无漂移"; exit 0
else echo "  ⚠️  有漂移 → 配置改了是否已重新部署?新部署是否打 tag + 跑 --update-baseline?"; exit 2; fi
