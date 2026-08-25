#!/usr/bin/env bash
# verify-status.sh —— 工程层验证能力(证据分级 L3「自动化测试过」的兜底;bus-check §2.7 自动调用)
# 本脚本按自身位置定位协调层根,放 <根>/scripts/ 或 <根>/pm/scripts/ 均可(紧凑布局见 SKILL §3);下文命令示例按默认布局写。
# 三种用法:
#   bash scripts/verify-status.sh        # 打印各套件状态:套件 | 命令 | 上次全绿时间(bus-check 调的是这个)
#   bash scripts/verify-status.sh --run  # 逐套件真跑;全绿的套件记录「上次全绿时间」到标记文件
#   bash scripts/verify-status.sh --format=machine
#                                       # 给 bus-check 返回稳定 TSV finding,不打印人类文案
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

RUN=0; FORMAT="human"
for arg in "$@"; do
  case "$arg" in
    --run) RUN=1 ;;
    --format=machine) FORMAT="machine" ;;
    *) echo "verify-status: unknown argument: $arg" >&2; exit 2 ;;
  esac
done
[ "$RUN" = 0 ] || [ "$FORMAT" = "human" ] || {
  echo "verify-status: --run cannot be combined with --format=machine" >&2
  exit 2
}

emit_machine_finding() {
  code="$1"; level="$2"; message="$3"; path="$4"
  message="$(printf '%s' "$message" | tr '\t\r\n' '   ')"
  path="$(printf '%s' "$path" | tr '\t\r\n' '   ')"
  printf 'FINDING\t%s\t%s\t%s\t%s\n' "$code" "$level" "$message" "$path"
}

mark_epoch() {
  value="$1"
  if date -j -f '%Y-%m-%d %H:%M' "$value" '+%s' >/dev/null 2>&1; then
    date -j -f '%Y-%m-%d %H:%M' "$value" '+%s'
  elif date -d "$value" '+%s' >/dev/null 2>&1; then
    date -d "$value" '+%s'
  else
    return 1
  fi
}

n=0; ph_warned=0; failed=0
for pair in "${SUITES[@]:-}"; do
  [ -n "$pair" ] || continue
  case "$pair" in *"<"*)
    if [ "$ph_warned" = 0 ] && [ "$FORMAT" = "human" ]; then
      echo "⚠️  SUITES 还是占位符 —— 填入真实测试命令,L3 级证据才有兜底(没有测试?先补,见 SKILL §8.5 第 3 步)"
    fi
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
      failed=$((failed + 1))
    fi
  elif [ "$FORMAT" = "human" ]; then
    last="从未全绿(或没在本机跑过)"; [ -f "$mark" ] && last="$(cat "$mark")"
    printf '%s | %s | 上次全绿:%s\n' "$name" "$cmd" "$last"
  else
    max_age_days="${BUS_L3_MAX_AGE_DAYS:-7}"
    case "$max_age_days" in ''|*[!0-9]*) max_age_days=7 ;; esac
    if [ ! -f "$mark" ]; then
      emit_machine_finding "sync.l3_stale" "warning" "Configured L3 suite '$name' has no local all-green marker." "$mark"
      continue
    fi
    last="$(head -1 "$mark" 2>/dev/null || true)"
    if ! last_epoch="$(mark_epoch "$last")"; then
      emit_machine_finding "sync.l3_stale" "warning" "Configured L3 suite '$name' has an unreadable all-green marker." "$mark"
      continue
    fi
    now_epoch="$(date '+%s')"
    age_days=$(( (now_epoch - last_epoch) / 86400 ))
    if [ "$age_days" -gt "$max_age_days" ]; then
      emit_machine_finding "sync.l3_stale" "warning" "Configured L3 suite '$name' is stale ($age_days days > $max_age_days days)." "$mark"
    fi
  fi
done
if [ "$n" = 0 ]; then
  if [ "$FORMAT" = "machine" ]; then
    emit_machine_finding "sync.l3_unconfigured" "unverified" "No real L3 suite is configured." "$SDIR/verify-status.sh"
  elif [ "$RUN" = 1 ]; then
    echo "(没有可跑的套件)"
  fi
fi
[ "$failed" -eq 0 ] || exit 1
exit 0
