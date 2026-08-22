#!/usr/bin/env bash
# bus-check.sh —— 协作总线 · 开工同步护栏(治信息差)。
# 任意域会话「开工先跑这个」;部署 / 改契约 / 跑 migration 等不可逆动作前**再跑一次**。
# 只读、不改任何东西;打印 当前期 / 协调层腐烂检测 / 契约 / 最近拍板 / 各域状态 / 幽灵hash核验 / 在途提案 / 子仓同步 / 线上实况。
# 规则⑨:「线上什么版本」以本脚本打的实况为准,文档不写。
# --strict:机器闸模式 —— 确凿检出「协调层腐烂 / 幽灵 hash / 生产漂移」任一即 exit 1(挂 pre-commit/CI 用,见 pre-commit.sh)。
#   只对确凿检出翻脸;「无法判定 / 未配置 / 跳过」不拦,不给流水线添堵。不带 --strict 仍恒 exit 0,只当仪表盘。
#
# 项目接入点(可选;下列同伴脚本一律**放在本脚本同一目录**,本脚本按 SDIR 找它们):
#   1) SUBREPOS 数组留空 = 自动发现协调层根下一/二级目录里的独立 git 子仓;也可手工列死。
#   2) 线上实况:提供 live-status.sh(自行调用部署平台 CLI,每行输出「名称<TAB或空格>版本」),
#      本脚本存在即调用、不存在则提示。跳过:BUS_CHECK_NO_LIVE=1
#      离线/弱网:BUS_CHECK_NO_FETCH=1 跳过 meta 仓与子仓的 git fetch(只看本地已知状态)
#   3) 生产漂移检测:提供 drift-check.sh + live-config.sh(见模板),
#      本脚本存在即调用;`--update-baseline` 会透传给它(部署/改 env 后刷基线)。
#   4) 工程层验证能力:改 verify-status.sh(模板含参考实现)的 SUITES 接入测试命令,
#      本脚本存在即调用 —— 证据分级 L3(自动化测试)靠它兜底;`--run` 真跑并记「上次全绿」。
set -uo pipefail
# 协调层根 = 向上最近的含 pm/NOW.md 的目录;SDIR = 本脚本目录(相对根),脚本间互调都走它。
# 故本脚本放 <根>/scripts/ 或 <根>/pm/scripts/ 均可(紧凑布局见 SKILL §3),不假设固定深度。
_sd="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$_sd"; for _ in 1 2 3 4; do [ -f "$ROOT/pm/NOW.md" ] && break; ROOT="$(dirname "$ROOT")"; done
[ -f "$ROOT/pm/NOW.md" ] || ROOT="$(cd "$_sd/.." && pwd)"   # 探测不到(骨架还没建) → 退回旧假设:脚本在 <根>/scripts/
SDIR="${_sd#"$ROOT"/}"; [ "$SDIR" = "$_sd" ] && SDIR="."
cd "$ROOT" || exit 1
DRIFT_MODE=""; STRICT=0; STRICT_HITS=""   # STRICT_HITS 累计确凿检出项;--strict 下非空 = exit 1
for arg in "$@"; do
  case "$arg" in
    --update-baseline) DRIFT_MODE="--update-baseline" ;;  # 透传给漂移检测
    --strict) STRICT=1 ;;
  esac
done

SUBREPOS=()   # 留空自动发现;或写死:SUBREPOS=("仓1" "目录/仓2")

echo "════════ 协作总线 开工同步 (bus-check) ════════"
echo "▸ 工作区: $ROOT   (协调层脚本: $SDIR/)"   # 打印解析结果:根认错了(嵌套项目/骨架没建)一眼能看出,不静默
echo ""

# 1) meta 仓是否落后远端
[ "${BUS_CHECK_NO_FETCH:-0}" = "1" ] || git fetch --quiet 2>/dev/null || true
LOCAL=$(git rev-parse @ 2>/dev/null || echo "?")
REMOTE=$(git rev-parse '@{u}' 2>/dev/null || echo "")
if [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
  m_behind=$(git rev-list --count 'HEAD..@{u}' 2>/dev/null || echo "?")
  m_ahead=$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo "?")
  if [ "$m_behind" != "0" ]; then
    echo "⚠️  meta 仓落后远端 $m_behind 个提交 —— 开工前先 git pull !"
  else
    echo "⚠️  meta 仓领先远端 $m_ahead 个提交(本地未推送)—— 记得 git push"
  fi
else
  echo "✅ meta 仓与远端同步(或无上游)"
fi

# 1.5) 子仓是否落后/领先远端
if [ ${#SUBREPOS[@]} -eq 0 ]; then
  for g in ./*/.git ./*/*/.git; do
    [ -d "$g" ] || continue
    SUBREPOS+=("${g%/.git}")
  done
fi
echo ""
echo "── 子仓 ⇄ 远端 ──"
for r in "${SUBREPOS[@]:-}"; do
  if [ -z "$r" ] || [ ! -d "$r/.git" ]; then
    continue
  fi
  [ "${BUS_CHECK_NO_FETCH:-0}" = "1" ] || git -C "$r" fetch --quiet 2>/dev/null || true
  if git -C "$r" rev-parse '@{u}' >/dev/null 2>&1; then
    ahead=$(git -C "$r" rev-list --count '@{u}..HEAD' 2>/dev/null || echo "?")
    behind=$(git -C "$r" rev-list --count 'HEAD..@{u}' 2>/dev/null || echo "?")
    head_h=$(git -C "$r" rev-parse --short HEAD 2>/dev/null || echo "?")
    flag="✅"; { [ "$behind" != "0" ] || [ "$ahead" != "0" ]; } && flag="⚠️ "
    printf "  %s %-32s HEAD %s  领先 %s / 落后 %s\n" "$flag" "${r#./}" "$head_h" "$ahead" "$behind"
  else
    printf "  ·  %-32s (无上游)\n" "${r#./}"
  fi
done
echo ""

# 1.7) 机器闸自检(一道闸的强度不超过守闸规则的强度 —— 用在跑的闸守新闸;.git/hooks 不进版本控制,克隆后闸不存在)
echo "── 机器闸自检 (pre-commit) ──"
gate_missing=""; gate_checked=0
for r in . "${SUBREPOS[@]:-}"; do
  [ -n "$r" ] || continue; [ -e "$r/.git" ] || continue
  gate_checked=1
  installed=0
  [ -f "$r/.git/hooks/pre-commit" ] && installed=1
  hpath=$(git -C "$r" config core.hooksPath 2>/dev/null || true)
  if [ -n "$hpath" ]; then
    { [ -f "$hpath/pre-commit" ] || [ -f "$r/$hpath/pre-commit" ]; } && installed=1
  fi
  [ "$installed" = 1 ] || gate_missing="$gate_missing ${r#./}"
done
if [ "$gate_checked" = 0 ]; then
  echo "  (没有可检查的 git 仓 —— 无法判定)"
elif [ -n "$gate_missing" ]; then
  echo "  ⚠️  未装 pre-commit 闸:${gate_missing# } —— 每仓装一次(装法见 $SDIR/pre-commit.sh 头部注释)"
else
  echo "  ✅ meta 仓与全部子仓均已装 pre-commit 闸"
fi
echo ""

# 2) 当前期 + 看板指针 (pm/NOW.md)
echo "── 当前期 / 协调看板 (pm/NOW.md) ──"
grep -m1 "^\*\*当前期" pm/NOW.md 2>/dev/null || echo "  (NOW.md 无「当前期」行)"
grep -m1 "本期轨道" pm/NOW.md 2>/dev/null || true
grep -m1 "当期看板" pm/NOW.md 2>/dev/null || true
echo ""

# 2.5) 协调层腐烂检测(仪式没有护栏 = 没有仪式;阈值可用 env 调:BUS_NOW_MAX / BUS_STATUS_MAX)
echo "── 协调层腐烂检测 ──"
if [ ! -f pm/NOW.md ]; then
  echo "  (pm/NOW.md 不存在 —— 无法判定,先按模板建骨架)"
else
  rot=0; board_note=""
  NOW_MAX="${BUS_NOW_MAX:-40}"; ST_MAX="${BUS_STATUS_MAX:-60}"
  # a) NOW 薄指针长肥(solobaton lessons 第 1 条:NOW 长肥 = 腐烂开端)
  now_lines=$(wc -l < pm/NOW.md | tr -d ' ')
  if [ "$now_lines" -gt "$NOW_MAX" ]; then
    echo "  ⚠️  pm/NOW.md 已 $now_lines 行(>$NOW_MAX)—— 薄指针长肥,跑换期压缩仪式(NOW 底部 checklist)"; rot=1
  fi
  # b) 当期看板存在性 + 非当期看板滞留 pm/(该 git mv 进 archive/<期>/)
  # shellcheck disable=SC2016 # single quotes intentionally protect the backticks in the sed pattern
  cur_board=$(grep -m1 "当期看板" pm/NOW.md 2>/dev/null | sed -n 's/.*`\([^`]*看板[^`]*\.md\)`.*/\1/p')
  cur_board=$(basename "${cur_board:-}" 2>/dev/null)
  case "$cur_board" in *"<"*) cur_board="";; esac   # NOW 还是占位符 → 判不了
  if [ -z "$cur_board" ]; then
    board_note="(NOW 未填当期看板,看板检查跳过)"
  else
    [ -f "pm/$cur_board" ] || { echo "  ⚠️  NOW 指向的当期看板 pm/$cur_board 不存在 —— 坏指针,先修 NOW"; rot=1; }
    for b in pm/*看板*.md; do
      [ -e "$b" ] || continue
      base="$(basename "$b")"
      [ "$base" = "$cur_board" ] || { echo "  ⚠️  $base 不是当期看板还留在 pm/ —— 归档进 pm/archive/<期>/"; rot=1; }
    done
  fi
  # c) status 文件超长(该截断:全文快照进 archive,live 只留基线+最近一条)
  for f in pm/status/*.md; do
    [ -e "$f" ] || continue
    base="$(basename "$f")"; [ "$base" = "README.md" ] && continue
    n=$(wc -l < "$f" | tr -d ' ')
    [ "$n" -le "$ST_MAX" ] || { echo "  ⚠️  pm/status/$base 已 $n 行(>$ST_MAX)—— 换期压缩仪式该截断了"; rot=1; }
  done
  if [ "$rot" = 0 ]; then
    if [ -n "$board_note" ]; then echo "  ✅ NOW 薄、status 克制 $board_note"
    else echo "  ✅ NOW 薄、看板归位、status 克制"; fi
  else
    STRICT_HITS="$STRICT_HITS 协调层腐烂"
  fi
fi
echo ""

# 2.7) 工程层验证能力(证据分级 L3「自动化测试」的前提是项目有能跑的测试;测试跑不动是比 NOW 长肥更重的腐烂)
echo "── 工程层验证能力 ──"
if [ -f "$SDIR/verify-status.sh" ]; then
  bash "$SDIR/verify-status.sh" 2>/dev/null | sed 's/^/  /' || echo "  (verify-status.sh 执行失败)"
else
  echo "  ⚠️  未配置 $SDIR/verify-status.sh —— 项目验证能力未知,L3 级证据无从谈起(接入:每行输出「套件名 测试命令 上次全绿时间」)"
fi
echo ""

# 3) 契约快照版本
echo "── 契约 (contracts/PROTOCOL.md) ──"
grep -m1 -E "契约快照对应版本" contracts/PROTOCOL.md 2>/dev/null || echo "  (无)"
echo ""

# 4) 最近拍板 (pm/decisions.md, 规则⑨ 决策单点)
echo "── 最近拍板 (pm/decisions.md, 最新 3 条) ──"
if [ -f pm/decisions.md ]; then
  if command -v perl >/dev/null 2>&1; then
    # perl -CSD -Mutf8 按「字符」截断,避免按字节截断把中文/省略号切成乱码
    grep -E '^\| 20[0-9]{2}-' pm/decisions.md | head -3 | perl -CSD -Mutf8 -ne 'chomp; $_ = substr($_,0,110)."…" if length() > 110; print "  $_\n"'
  else
    grep -E '^\| 20[0-9]{2}-' pm/decisions.md | head -3 | sed 's/^/  /'   # 无 perl:降级为不截断(截字节会把中文切成乱码)
  fi
else
  echo "  (无 pm/decisions.md)"
fi
echo ""

# 5) 各域状态文件最近更新
echo "── 各域状态 (pm/status/) ──"
if [ -d pm/status ]; then
  for f in pm/status/*.md; do
    [ -e "$f" ] || continue
    base="$(basename "$f")"; [ "$base" = "README.md" ] && continue
    line=$(git log -1 --format="%h %ad %s" --date=short -- "$f" 2>/dev/null)
    printf "  %-10s %s\n" "${base%.md}" "${line:-(未提交/未跟踪)}"
  done
else
  echo "  (无 pm/status/)"
fi
echo ""

# 5.5) 幽灵 hash 核验(lessons 第 11 条:status 声明的 commit 必须真实存在;「写了状态」≠「已提交」)
echo "── 幽灵 hash 核验 (pm/status/) ──"
if [ -d pm/status ]; then
  # 只认**反引号内**的 token(status 模板约定 hash 写成 `hash`,把约定变成解析规则,治误报):
  #   先从反引号串里**抠掉** URL 与 sha256: digest(不整段丢弃——同段混有链接和真 hash 时保住 hash);
  #   token 须同含字母与数字(干掉 defaced 这类纯字母英文词)。
  #   代价:纯字母/纯数字的 7 位真 hash(各约 0.1%/3.7%)会被静默跳过——良性漏检,换不误拦。
  HASHES=$(for f in pm/status/*.md; do
      [ -e "$f" ] || continue; [ "$(basename "$f")" = "README.md" ] && continue
      # shellcheck disable=SC2016 # backticks are literal Markdown delimiters, not shell expansion
      grep -hoE '`[^`]*`' "$f" 2>/dev/null
    done | sed -E 's#[a-zA-Z][a-zA-Z0-9+.-]*://[^` ]*##g; s#sha256:[0-9a-fA-F]*##g' \
        | grep -hoE '\b[0-9a-f]{7,40}\b' | grep '[a-f]' | grep '[0-9]' | sort -u)
  ghost=0; total=0
  for h in $HASHES; do
    total=$((total+1)); found=0
    for r in . "${SUBREPOS[@]:-}"; do
      if [ -z "$r" ] || [ ! -d "$r" ]; then
        continue
      fi
      git -C "$r" cat-file -t "$h" >/dev/null 2>&1 && { found=1; break; }
    done
    [ "$found" = 1 ] || { echo "  ⚠️  $h —— meta 仓与全部子仓查无此号(幽灵 hash:臆造/被重置/躺工作树没提交;若刚换机器,先 git pull 复核)"; ghost=1; }
  done
  if [ "$ghost" = 1 ]; then STRICT_HITS="$STRICT_HITS 幽灵hash"
  elif [ "$total" = 0 ]; then echo "  (status 里暂无 hash)"
  else echo "  ✅ $total 个 hash 全部可解析"; fi
else
  echo "  (无 pm/status/)"
fi
echo ""

# 6) 在途变更提案
echo "── 在途变更提案 (pm/changes/) ──"
found=0
for f in pm/changes/*.md; do
  [ -e "$f" ] || continue
  base="$(basename "$f")"; [ "$base" = "README.md" ] && continue
  echo "  - $base"; found=1
done
[ "$found" = 0 ] && echo "  (无)"
echo ""

# 7) 线上实况(规则⑨:线上版本唯一查询口;文档里的版本号一律不作准)
echo "── 线上实况 ──"
if [ "${BUS_CHECK_NO_LIVE:-0}" = "1" ]; then
  echo "  (BUS_CHECK_NO_LIVE=1 跳过;线上版本以重跑本脚本为准)"
elif [ -f "$SDIR/live-status.sh" ]; then
  bash "$SDIR/live-status.sh" 2>/dev/null | sed 's/^/  /' || echo "  (live-status.sh 执行失败 —— 检查部署平台 CLI 凭据/网络)"
else
  echo "  (未配置 $SDIR/live-status.sh —— 接入部署平台 CLI 后,每行输出「服务名 版本」即可;在此之前别引用任何文档里的\"当前版本\")"
fi
echo ""

# 7.5) 生产漂移检测(平台侧 env/secret 指纹 + 镜像tag↔git vs scripts/bus-baseline.json)
echo "── 生产漂移检测 ──"
if [ -f "$SDIR/drift-check.sh" ]; then
  bash "$SDIR/drift-check.sh" $DRIFT_MODE; drc=$?
  [ "$drc" = 2 ] && STRICT_HITS="$STRICT_HITS 生产漂移"   # drift-check 约定:exit 2 = 确凿检出漂移
else
  echo "  (未配置 $SDIR/drift-check.sh —— 拷模板 + 接 live-config.sh 后,可检出「配置被改没部署 / 线上镜像 git 里找不到」类漂移)"
fi
echo ""

# 8) 最近 5 个 meta-repo commit
echo "── 最近提交 (meta) ──"
git log --oneline -5 2>/dev/null
echo ""
echo "▸ 开工四步: ① git pull(含子仓)  ② 读 NOW → 当期看板 → 契约 → 最近拍板  ③ 确认你域要动的不 stale  ④ 不可逆动作(部署/契约/migration)前重跑本脚本"
if [ "$STRICT" = 1 ] && [ -n "$STRICT_HITS" ]; then
  echo "⛔ strict 未过:${STRICT_HITS# } —— 按上方 ⚠️ 红字修完再来(机器闸非零退出)"
  echo "════════════════════════════════════════════"
  exit 1
fi
echo "════════════════════════════════════════════"
