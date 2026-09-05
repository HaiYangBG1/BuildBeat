#!/usr/bin/env bash
# bus-check.sh —— 协作总线 · 开工同步护栏(治信息差)。
# 任意域会话「开工先跑这个」;部署 / 改契约 / 跑 migration 等不可逆动作前**再跑一次**。
# 只读、不改任何东西;打印 当前期 / 协调层腐烂检测 / Gate与证据 / 可选 standards与ADR / 契约 / 最近拍板 / 各域状态 / 幽灵hash核验 / 在途提案 / 子仓同步 / 线上实况。
# 规则⑨:「线上什么版本」以本脚本打的实况为准,文档不写。
# --format=json:只在 stdout 输出 schema 1 JSON;不混入人类仪表盘。
# --strict:机器闸模式 —— finding level 为 conflict / error 时 exit 1(挂 pre-commit/CI 用,见 pre-commit.sh)。
#   warning / unverified 保持可见但不拦。不带 --strict 时即使有 findings 仍 exit 0,只当仪表盘。
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
#   5) 可选 standards/STACK.md 结构合法且 Confirmed 时,比对 v1 基线与 Node/lockfile/Docker 普通文件事实;
#      只报 drift/unverified,不改任何文件。默认最多扫 200 个相关候选,可用 BUS_STACK_MAX 调整。
set -uo pipefail
# 协调层根 = 向上最近的含 pm/NOW.md 的目录;SDIR = 本脚本目录(相对根),脚本间互调都走它。
# 故本脚本放 <根>/scripts/ 或 <根>/pm/scripts/ 均可(紧凑布局见 SKILL §3),不假设固定深度。
_sd="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$_sd"; for _ in 1 2 3 4; do [ -f "$ROOT/pm/NOW.md" ] && break; ROOT="$(dirname "$ROOT")"; done
[ -f "$ROOT/pm/NOW.md" ] || ROOT="$(cd "$_sd/.." && pwd)"   # 探测不到(骨架还没建) → 退回旧假设:脚本在 <根>/scripts/
SDIR="${_sd#"$ROOT"/}"; [ "$SDIR" = "$_sd" ] && SDIR="."
cd "$ROOT" || { echo "bus-check: cannot enter coordination root" >&2; exit 2; }
ROOT_PHYS="$(pwd -P)"
DRIFT_MODE=""; STRICT=0; FORMAT="human"
for arg in "$@"; do
  case "$arg" in
    --update-baseline) DRIFT_MODE="--update-baseline" ;;  # 透传给漂移检测
    --strict) STRICT=1 ;;
    --format=json) FORMAT="json" ;;
    *) echo "bus-check: unknown argument: $arg" >&2; exit 2 ;;
  esac
done

BUS_TMP="$(mktemp -d "${TMPDIR:-/tmp}/buildbeat-bus-check.XXXXXX")" || {
  echo "bus-check: cannot create temporary report directory" >&2
  exit 2
}
FINDINGS_RAW="$BUS_TMP/findings.raw"
FINDINGS_SORTED="$BUS_TMP/findings.sorted"
HUMAN_OUT="$BUS_TMP/human.out"
: > "$FINDINGS_RAW"
: > "$FINDINGS_SORTED"
: > "$HUMAN_OUT"
# shellcheck disable=SC2317,SC2329 # invoked indirectly by trap
cleanup_bus_check() { rm -rf -- "$BUS_TMP"; }
trap cleanup_bus_check EXIT

# Keep the existing dashboard byte-compatible enough for people while JSON gets
# stdout to itself. All blocking decisions are derived from FINDINGS_RAW.
exec 3>&1
if [ "$FORMAT" = "json" ]; then exec > "$HUMAN_OUT"; fi

finding_rank() {
  case "$1" in
    sync.now_bloated) echo 10 ;;
    sync.ghost_hash) echo 20 ;;
    sync.production_drift) echo 30 ;;
    sync.multirepo_drift) echo 35 ;;
    sync.l3_stale) echo 40 ;;
    sync.l3_unconfigured) echo 50 ;;
    sync.scan_truncated) echo 60 ;;
    sync.unverified) echo 70 ;;
    gate.line_missing) echo 100 ;;
    gate.invalid) echo 105 ;;
    gate.na_without_reason) echo 110 ;;
    gate.na_inconsistent) echo 115 ;;
    gate.pass_untraceable) echo 120 ;;
    evidence.missing) echo 200 ;;
    evidence.outside_archive) echo 210 ;;
    ref.broken) echo 300 ;;
    standards.invalid) echo 400 ;;
    standards.unconfirmed) echo 410 ;;
    stack.drift) echo 420 ;;
    stack.unverified) echo 430 ;;
    adr.status_invalid) echo 500 ;;
    adr.superseded_broken) echo 510 ;;
    *) echo 900 ;;
  esac
}

add_finding() {
  code="$1"; level="$2"; message="$3"; path="${4:-}"
  rank="$(finding_rank "$code")"
  message="$(printf '%s' "$message" | tr '\t\r\n' '   ')"
  path="$(printf '%s' "$path" | tr '\t\r\n' '   ')"
  printf '%s\t%s\t%s\t%s\t%s\n' "$rank" "$code" "$level" "$message" "$path" >> "$FINDINGS_RAW"
}

# Mechanical coverage boundaries share one non-blocking finding. The reason
# token is intentionally small and stable; details never include raw OS errors
# or file contents, and the path remains coordination-root relative.
add_scan_boundary() {
  boundary_reason="$1"; boundary_path="$2"; boundary_detail="$3"
  add_finding "sync.scan_truncated" "unverified" \
    "Scan coverage is incomplete: reason=$boundary_reason; $boundary_detail." \
    "$boundary_path"
}

path_uses_symlink_component() {
  boundary_probe="$1"
  case "$boundary_probe" in
    "$ROOT_PHYS"/*) ;;
    *) return 1 ;;
  esac
  while [ "$boundary_probe" != "$ROOT_PHYS" ]; do
    [ -L "$boundary_probe" ] && return 0
    boundary_parent="$(dirname "$boundary_probe")"
    [ "$boundary_parent" != "$boundary_probe" ] || break
    boundary_probe="$boundary_parent"
  done
  return 1
}

resolve_hash() {
  candidate_hash="$1"
  for hash_repo in . "${SUBREPOS[@]:-}"; do
    [ -n "$hash_repo" ] || continue
    [ -d "$hash_repo" ] || continue
    if [ "$hash_repo" != "." ]; then
      path_uses_symlink_component "$ROOT_PHYS/${hash_repo#./}" && continue
      if [ ! -r "$hash_repo" ] || [ ! -x "$hash_repo" ]; then continue; fi
    fi
    git -C "$hash_repo" cat-file -t "$candidate_hash" >/dev/null 2>&1 && return 0
  done
  return 1
}

# Return 0=local/hash valid, 1=broken/unsafe local/hash, 2=remote (traceable
# but unverified), 3=not a machine-reference token, 4=in-root symlink boundary,
# 5=permission boundary. Callers keep 4/5 unverified rather than calling them
# missing, valid, or contradictory.
validate_reference() {
  ref="$1"; source_path="$2"; allow_source_relative="${3:-0}"
  case "$ref" in
    http://*|https://*) return 2 ;;
  esac
  if printf '%s' "$ref" | grep -Eq '^[0-9a-f]{7,40}$' \
      && printf '%s' "$ref" | grep -q '[a-f]' \
      && printf '%s' "$ref" | grep -q '[0-9]'; then
    resolve_hash "$ref" && return 0
    return 1
  fi
  ref="${ref%%#*}"; ref="${ref%%\?*}"
  ref="$(printf '%s' "$ref" | sed -E 's/:[0-9]+$//')"
  case "$ref" in
    ""|*$'\n'*|*$'\r'*|*$'\t'*|*"<"*|*"\\"*|*"*"*|*"?"*|*"["*|*"]"*|*"|"*) return 3 ;;
    /*) return 1 ;;
    ../*|*/../*|*/..|./*|*/./*)
      [ "$allow_source_relative" = "1" ] || return 1
      ;;
  esac
  [ "${#ref}" -le 240 ] || return 3
  case "$ref" in
    *.md|*.json|*.html|*.png|*.jpg|*.jpeg|*.svg|*.txt|*.log|*/*) ;;
    *) return 3 ;;
  esac
  reference_candidates=()
  case "$ref" in
    pm/*|contracts/*|design/*|scripts/*|tests/*|docs/*|example/*)
      reference_candidates+=("$ROOT_PHYS/$ref")
      ;;
    *)
      source_dir="$(dirname "$source_path")"
      [ "$source_dir" = "." ] && source_dir=""
      reference_candidates+=("$ROOT_PHYS/${source_dir:+$source_dir/}$ref")
      reference_candidates+=("$ROOT_PHYS/$ref")
      case "$ref" in */*) ;; *) reference_candidates+=("$ROOT_PHYS/contracts/$ref") ;; esac
      ;;
  esac
  for candidate in "${reference_candidates[@]}"; do
    [ -f "$candidate" ] || continue
    resolved="$(realpath "$candidate" 2>/dev/null)" || return 1
    case "$resolved" in
      "$ROOT_PHYS"/*) ;;
      *) return 1 ;;
    esac
    path_uses_symlink_component "$candidate" && return 4
    [ -r "$candidate" ] || return 5
    return 0
  done
  return 1
}

reference_display_path() {
  display_ref="$1"
  display_ref="${display_ref%%#*}"
  display_ref="${display_ref%%\?*}"
  display_ref="$(printf '%s' "$display_ref" | sed -E 's/:[0-9]+$//')"
  printf '%s\n' "$display_ref"
}

extract_backtick_tokens() {
  # shellcheck disable=SC2016 # backticks are literal Markdown delimiters
  printf '%s\n' "$1" | grep -oE '`[^`]+`' 2>/dev/null | sed 's/^`//; s/`$//' || true
}

# Return 0 when a decision reference names one existing dated table row in the
# canonical ledger. The explicit line keeps a passed Gate tied to one decision,
# not merely to the existence of decisions.md.
validate_decision_reference() {
  decision_ref="$1"
  if ! printf '%s\n' "$decision_ref" | grep -Eq '^pm/decisions\.md:[1-9][0-9]{0,6}$'; then
    return 1
  fi
  decision_line_n="${decision_ref##*:}"
  [ -f pm/decisions.md ] && [ ! -L pm/decisions.md ] && [ -r pm/decisions.md ] || return 1
  path_uses_symlink_component "$ROOT_PHYS/pm/decisions.md" && return 1
  decision_line="$(sed -n "${decision_line_n}p" pm/decisions.md 2>/dev/null || true)"
  printf '%s\n' "$decision_line" \
    | grep -Eq '^[[:space:]]*\|[[:space:]]*[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]]*\|'
}

# Call only after validate_reference succeeds. Return 0=canonical local
# evidence path, 1=local path outside pm/archive/<期>/evidence/, 2=hash/other.
evidence_location_status() {
  evidence_ref="$1"
  case "$evidence_ref" in
    http://*|https://*) return 2 ;;
  esac
  if printf '%s' "$evidence_ref" | grep -Eq '^[0-9a-f]{7,40}$'; then
    return 2
  fi
  evidence_ref="${evidence_ref%%#*}"
  evidence_ref="${evidence_ref%%\?*}"
  evidence_ref="$(printf '%s' "$evidence_ref" | sed -E 's/:[0-9]+$//')"
  case "$evidence_ref" in
    *.md|*.json|*.html|*.png|*.jpg|*.jpeg|*.svg|*.txt|*.log|*/*) ;;
    *) return 2 ;;
  esac
  if printf '%s\n' "$evidence_ref" \
      | grep -Eq '^pm/archive/[^/]+/evidence/[^/].*$'; then
    return 0
  fi
  return 1
}

# Best-effort positive UI detection only. A miss is never proof that the
# project has no UI; it simply means gate.na_inconsistent is not emitted.
detect_ui_signal() {
  if [ -f standards/DESIGN.md ] && [ ! -L standards/DESIGN.md ]; then
    return 0
  fi
  ui_files="$BUS_TMP/ui-candidates"
  if ! find -P . \
      \( -type d \( -name .claude -o -name .codex -o -name .git -o -name .buildbeat -o -name .solobaton \
        -o -name .next -o -name .nuxt -o -name .output -o -name build -o -name coverage \
        -o -name dist -o -name node_modules -o -name target -o -name vendor \) -prune \) -o \
      \( -type f \( -name index.html -o -name package.json -o -name manifest.json \) \) -print0 \
      > "$ui_files" 2>/dev/null; then
    return 1
  fi
  ui_count=0
  while IFS= read -r -d '' ui_file; do
    ui_count=$((ui_count + 1))
    [ "$ui_count" -le 5000 ] || return 1
    case "${ui_file##*/}" in
      index.html) return 0 ;;
      package.json)
        if grep -Eq '"(@angular/core|@sveltejs/kit|next|nuxt|react|svelte|vite|vue)"[[:space:]]*:' "$ui_file" 2>/dev/null; then
          return 0
        fi
        ;;
      manifest.json)
        if grep -Eq '"manifest_version"[[:space:]]*:[[:space:]]*[23]' "$ui_file" 2>/dev/null \
            && grep -Eq '"(action|browser_action|content_scripts|options_page|options_ui|page_action|side_panel)"[[:space:]]*:' "$ui_file" 2>/dev/null; then
          return 0
        fi
        ;;
    esac
  done < "$ui_files"
  return 1
}

is_release_version_token() {
  case "$1" in
    *$'\n'*|*$'\r'*|*$'\t'*) return 1 ;;
  esac
  [ "${#1}" -le 100 ] || return 1
  printf '%s\n' "$1" \
    | grep -Eq '^[vV]?[0-9]+(\.[0-9]+){1,2}(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'
}

normalize_release_version() {
  normalized_version="$1"
  case "$normalized_version" in
    v*|V*) normalized_version="${normalized_version#?}" ;;
  esac
  printf '%s\n' "$normalized_version"
}

# The first non-Unreleased H2 heading is the only CHANGELOG version source.
# Free-form production notes remain visible to people but are not guessed into
# a version; projects can adopt a canonical release heading to close coverage.
read_changelog_head_version() {
  changelog_path="$1"
  changelog_heading="$(awk '
    /^##[[:space:]]+/ {
      lower=tolower($0)
      if (lower !~ /unreleased/) { print; exit }
    }
  ' "$changelog_path" 2>/dev/null || true)"
  [ -n "$changelog_heading" ] || return 1
  changelog_version="$(printf '%s\n' "$changelog_heading" \
    | sed -E 's/^##[[:space:]]+//; s/[[:space:]].*$//; s/^\[//; s/\]$//')"
  is_release_version_token "$changelog_version" || return 1
  printf '%s\n' "$changelog_version"
}

# A mapped contract file must expose exactly one canonical snapshot line and a
# single backticked release token. This validates linkage, not contract truth.
read_contract_snapshot_version() {
  contract_path="$1"
  contract_lines="$(grep -E '契约快照对应版本' "$contract_path" 2>/dev/null || true)"
  contract_count="$(printf '%s\n' "$contract_lines" | awk 'NF { n++ } END { print n+0 }')"
  [ "$contract_count" -eq 1 ] || return 1
  contract_tokens="$(extract_backtick_tokens "$contract_lines")"
  contract_token_count="$(printf '%s\n' "$contract_tokens" | awk 'NF { n++ } END { print n+0 }')"
  [ "$contract_token_count" -eq 1 ] || return 1
  contract_version="$contract_tokens"
  [ -n "$contract_version" ] || return 1
  is_release_version_token "$contract_version" || return 1
  printf '%s\n' "$contract_version"
}

multirepo_map_value_safe() {
  map_value="$1"; map_value_max="$2"
  case "$map_value" in
    *$'\n'*|*$'\r'*|*$'\t'*) return 1 ;;
  esac
  [ -n "$map_value" ] && [ "${#map_value}" -le "$map_value_max" ] \
    && ! printf '%s' "$map_value" | LC_ALL=C grep -q '[[:cntrl:]]' \
    && ! printf '%s\n' "$map_value" | grep -Eq '[|`"\\]|<[^>]*>'
}

multirepo_repo_path_safe() {
  multirepo_map_value_safe "$1" 200 || return 1
  ! printf '%s\n' "$1" \
    | grep -Eq '(^/|/$|(^|/)\.\.?(/|$)|//)'
}

# Cross-check only explicitly joined sources. contracts/PROTOCOL.md owns the
# expected repo inventory and source map; implicit directory/prose inference
# would turn unrelated version domains into false drift.
check_multirepo_drift() {
  multirepo_map_path="contracts/PROTOCOL.md"
  multirepo_map_raw="$BUS_TMP/multirepo.map.raw"
  multirepo_records="$BUS_TMP/multirepo.records"
  multirepo_expected="$BUS_TMP/multirepo.expected"
  multirepo_discovered="$BUS_TMP/multirepo.discovered"
  : > "$multirepo_map_raw"
  : > "$multirepo_records"
  : > "$multirepo_expected"
  : > "$multirepo_discovered"

  for multirepo_item in "${SUBREPOS[@]:-}"; do
    [ -n "$multirepo_item" ] || continue
    printf '%s\n' "${multirepo_item#./}" >> "$multirepo_discovered"
  done
  LC_ALL=C sort -u "$multirepo_discovered" -o "$multirepo_discovered"

  multirepo_map_real="$(realpath "$multirepo_map_path" 2>/dev/null || true)"
  multirepo_map_unsafe=0
  multirepo_map_boundary=""
  if [ -L "$multirepo_map_path" ] \
      || { [ -e "$multirepo_map_path" ] \
        && path_uses_symlink_component "$ROOT_PHYS/$multirepo_map_path"; }; then
    multirepo_map_unsafe=1
    multirepo_map_boundary="symlink"
  elif [ -e "$multirepo_map_path" ] && [ ! -r "$multirepo_map_path" ]; then
    multirepo_map_unsafe=1
    multirepo_map_boundary="permission"
  elif [ ! -f "$multirepo_map_path" ] || [ -z "$multirepo_map_real" ]; then
    multirepo_map_unsafe=1
  else
    case "$multirepo_map_real" in
      "$ROOT_PHYS"/*) ;;
      *) multirepo_map_unsafe=1; multirepo_map_boundary="symlink" ;;
    esac
  fi
  if [ "$multirepo_map_unsafe" -eq 1 ]; then
    if [ -n "$multirepo_map_boundary" ]; then
      echo "  ⚠️  $multirepo_map_path 因 $multirepo_map_boundary 边界未读取"
      add_scan_boundary "$multirepo_map_boundary" "$multirepo_map_path" \
        "the multi-repository map was not read"
    fi
    if [ ! -s "$multirepo_discovered" ]; then
      echo "  · 未发现子仓;多仓漂移检查不适用"
      return
    fi
    while IFS= read -r multirepo_repo; do
      echo "  ⚠️  $multirepo_repo 未在可读契约 map 中登记 —— 多仓版本关系未核验"
      add_finding "sync.unverified" "unverified" "Discovered repo=$multirepo_repo has no readable buildbeat-multirepo-map:v1 source." "$multirepo_repo"
    done < "$multirepo_discovered"
    return
  fi

  multirepo_marker_count="$(grep -c '^<!-- buildbeat-multirepo-map:v1$' "$multirepo_map_path" 2>/dev/null || true)"
  if [ "$multirepo_marker_count" -eq 0 ]; then
    if [ ! -s "$multirepo_discovered" ]; then
      echo "  · 未发现子仓;未配置多仓 map 不产生 finding"
      return
    fi
    while IFS= read -r multirepo_repo; do
      echo "  ⚠️  $multirepo_repo 未在 buildbeat-multirepo-map:v1 登记"
      add_finding "sync.unverified" "unverified" "Discovered repo=$multirepo_repo is absent from buildbeat-multirepo-map:v1." "$multirepo_repo"
    done < "$multirepo_discovered"
    return
  fi

  multirepo_map_invalid=0
  if ! awk '
    $0 == "<!-- buildbeat-multirepo-map:v1" {
      starts++
      if (inside) bad=1
      inside=1
      next
    }
    inside && $0 == "-->" {
      closes++
      inside=0
      next
    }
    inside { print }
    END {
      if (starts != 1 || closes != 1 || inside || bad) exit 2
    }
  ' "$multirepo_map_path" > "$multirepo_map_raw"; then
    multirepo_map_invalid=1
  fi

  while IFS= read -r multirepo_line || [ -n "$multirepo_line" ]; do
    multirepo_line="${multirepo_line%$'\r'}"
    [ -n "$multirepo_line" ] || continue
    if ! printf '%s\n' "$multirepo_line" \
        | grep -Eq '^repo=[^|]+\|contract=[^|]+\|deployment=[^|]+(\|changelog=[^|]+)?$'; then
      multirepo_map_invalid=1
      continue
    fi
    IFS='|' read -r multirepo_repo_field multirepo_contract_field multirepo_deployment_field multirepo_changelog_field <<< "$multirepo_line"
    multirepo_repo="${multirepo_repo_field#repo=}"
    multirepo_contract="${multirepo_contract_field#contract=}"
    multirepo_deployment="${multirepo_deployment_field#deployment=}"
    # 可选第 4 字段 changelog=<repo 内的 CHANGELOG 路径>:多模块仓没有根 CHANGELOG 时,
    # 由 map 显式指定承载契约版本的模块 CHANGELOG;缺省仍为 <repo>/CHANGELOG.md。
    multirepo_changelog_override="${multirepo_changelog_field#changelog=}"
    [ -n "$multirepo_changelog_field" ] || multirepo_changelog_override=""
    multirepo_repo_trimmed="$(printf '%s' "$multirepo_repo" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    multirepo_contract_trimmed="$(printf '%s' "$multirepo_contract" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    multirepo_deployment_trimmed="$(printf '%s' "$multirepo_deployment" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    if [ "$multirepo_repo" != "$multirepo_repo_trimmed" ] \
        || [ "$multirepo_contract" != "$multirepo_contract_trimmed" ] \
        || [ "$multirepo_deployment" != "$multirepo_deployment_trimmed" ] \
        || ! multirepo_repo_path_safe "$multirepo_repo" \
        || ! multirepo_map_value_safe "$multirepo_contract" 240 \
        || ! { [ "$multirepo_contract" = "n/a" ] \
          || printf '%s\n' "$multirepo_contract" | grep -Eq '^contracts/[^/].*\.md$'; } \
        || ! multirepo_map_value_safe "$multirepo_deployment" 100; then
      multirepo_map_invalid=1
      continue
    fi
    # contract=n/a 表示该仓没有契约版本域(如只读存量前端、npm 包 semver 与契约版本不同域),
    # 只登记入 inventory、不做版本核对;不得用它掩盖真实存在的契约版本关系。
    if [ -n "$multirepo_changelog_override" ]; then
      if ! multirepo_repo_path_safe "$multirepo_changelog_override" \
          || [ "${#multirepo_changelog_override}" -gt 240 ] \
          || ! printf '%s\n' "$multirepo_changelog_override" | grep -Eq "^$(printf '%s' "$multirepo_repo" | sed 's/[.[\*^$]/\\&/g')/.+/CHANGELOG\.md$"; then
        multirepo_map_invalid=1
        continue
      fi
    fi
    printf '%s\t%s\t%s\t%s\n' "$multirepo_repo" "$multirepo_contract" "$multirepo_deployment" "$multirepo_changelog_override" >> "$multirepo_records"
    printf '%s\n' "$multirepo_repo" >> "$multirepo_expected"
  done < "$multirepo_map_raw"

  multirepo_record_count="$(awk 'NF { n++ } END { print n+0 }' "$multirepo_records")"
  multirepo_duplicate="$(LC_ALL=C sort "$multirepo_expected" | uniq -d | head -1)"
  if [ "$multirepo_record_count" -eq 0 ] || [ -n "$multirepo_duplicate" ]; then
    multirepo_map_invalid=1
  fi
  LC_ALL=C sort -u "$multirepo_expected" -o "$multirepo_expected"

  if [ "$multirepo_map_invalid" -eq 1 ]; then
    echo "  ⚠️  $multirepo_map_path 的 buildbeat-multirepo-map:v1 缺失、重复或格式无效"
    add_finding "sync.unverified" "unverified" "The buildbeat-multirepo-map:v1 source is missing, duplicated, empty, or malformed." "$multirepo_map_path"
    while IFS= read -r multirepo_repo; do
      add_finding "sync.unverified" "unverified" "Discovered repo=$multirepo_repo could not be joined because the multi-repo map is invalid." "$multirepo_repo"
    done < "$multirepo_discovered"
    return
  fi

  while IFS= read -r multirepo_repo; do
    grep -Fxq "$multirepo_repo" "$multirepo_expected" && continue
    echo "  ⚠️  $multirepo_repo 已发现但未在 buildbeat-multirepo-map:v1 登记"
    add_finding "sync.unverified" "unverified" "Discovered repo=$multirepo_repo is absent from buildbeat-multirepo-map:v1." "$multirepo_repo"
  done < "$multirepo_discovered"

  while IFS=$'\t' read -r multirepo_repo multirepo_contract multirepo_deployment multirepo_changelog_override; do
    [ -n "$multirepo_repo" ] || continue
    multirepo_changelog="${multirepo_changelog_override:-$multirepo_repo/CHANGELOG.md}"
    multirepo_issue=0
    multirepo_drift=0
    multirepo_changelog_ok=0
    multirepo_contract_ok=0
    multirepo_deployment_ok=0
    multirepo_changelog_version=""
    multirepo_contract_version=""
    multirepo_deployment_version=""

    if ! grep -Fxq "$multirepo_repo" "$multirepo_discovered"; then
      if [ -L "$multirepo_repo" ] \
          || { [ -e "$multirepo_repo" ] \
            && path_uses_symlink_component "$ROOT_PHYS/$multirepo_repo"; }; then
        echo "  ⚠️  $multirepo_repo 在 map 中登记,但经 symlink 到达"
        add_scan_boundary "symlink" "$multirepo_repo" \
          "the discovered repository was not traversed"
      elif [ -d "$multirepo_repo" ] \
          && { [ ! -r "$multirepo_repo" ] || [ ! -x "$multirepo_repo" ]; }; then
        echo "  ⚠️  $multirepo_repo 在 map 中登记,但当前权限不足"
        add_scan_boundary "permission" "$multirepo_repo" \
          "the discovered repository was not readable and searchable"
      else
        echo "  ⚠️  $multirepo_repo 在 map 中登记,但未被既有 SUBREPOS 深度发现"
        add_finding "sync.unverified" "unverified" "Expected repo=$multirepo_repo was not observed by the bounded SUBREPOS discovery." "$multirepo_repo"
      fi
      continue
    fi

    multirepo_repo_real="$(realpath "$multirepo_repo" 2>/dev/null || true)"
    if [ -L "$multirepo_repo" ] \
        || path_uses_symlink_component "$ROOT_PHYS/$multirepo_repo"; then
      echo "  ⚠️  $multirepo_repo 经 symlink 到达,未跟随扫描"
      add_scan_boundary "symlink" "$multirepo_repo" \
        "the discovered repository was not traversed"
      continue
    fi
    if [ -z "$multirepo_repo_real" ]; then
      echo "  ⚠️  $multirepo_repo 不是可安全扫描的 regular 子仓目录"
      add_finding "sync.unverified" "unverified" "Expected repo=$multirepo_repo cannot be resolved safely." "$multirepo_repo"
      continue
    fi
    if [ ! -r "$multirepo_repo" ] || [ ! -x "$multirepo_repo" ]; then
      echo "  ⚠️  $multirepo_repo 当前权限不足,未遍历"
      add_scan_boundary "permission" "$multirepo_repo" \
        "the discovered repository was not readable and searchable"
      continue
    fi
    case "$multirepo_repo_real" in
      "$ROOT_PHYS"/*) ;;
      *)
        echo "  ⚠️  $multirepo_repo 解析到协调根之外"
        add_finding "sync.unverified" "unverified" "Expected repo=$multirepo_repo resolves outside the coordination root." "$multirepo_repo"
        continue
        ;;
    esac

    if [ "$multirepo_contract" = "n/a" ] && [ "$multirepo_deployment" = "n/a" ]; then
      echo "  · $multirepo_repo 已登记,无契约/部署版本域(contract=n/a, deployment=n/a),不做版本核对"
      continue
    fi
    if [ -L "$multirepo_changelog" ] \
        || { [ -e "$multirepo_changelog" ] \
          && path_uses_symlink_component "$ROOT_PHYS/$multirepo_changelog"; }; then
      echo "  ⚠️  $multirepo_changelog 经 symlink 到达,未读取"
      add_scan_boundary "symlink" "$multirepo_changelog" \
        "the mapped CHANGELOG version source was not read"
      multirepo_issue=1
    elif [ -e "$multirepo_changelog" ] && [ ! -r "$multirepo_changelog" ]; then
      echo "  ⚠️  $multirepo_changelog 当前权限不足,未读取"
      add_scan_boundary "permission" "$multirepo_changelog" \
        "the mapped CHANGELOG version source was not readable"
      multirepo_issue=1
    elif [ ! -f "$multirepo_changelog" ]; then
      echo "  ⚠️  $multirepo_repo 缺少可读 regular $multirepo_changelog"
      add_finding "sync.unverified" "unverified" "Repo=$multirepo_repo has no readable regular CHANGELOG version source: $multirepo_changelog." "$multirepo_changelog"
      multirepo_issue=1
    else
      multirepo_changelog_version="$(read_changelog_head_version "$multirepo_changelog" || true)"
      if [ -z "$multirepo_changelog_version" ]; then
        echo "  ⚠️  $multirepo_changelog 的首个已发布 H2 不是可核对版本"
        add_finding "sync.unverified" "unverified" "Repo=$multirepo_repo CHANGELOG head has no parseable released version token." "$multirepo_changelog"
        multirepo_issue=1
      else
        multirepo_changelog_ok=1
      fi
    fi

    multirepo_contract_rc=0
    if [ "$multirepo_contract" = "n/a" ]; then
      multirepo_contract_rc=0
    else
      validate_reference "$multirepo_contract" "$multirepo_map_path" || multirepo_contract_rc=$?
    fi
    if [ "$multirepo_contract" = "n/a" ]; then
      :
    elif [ "$multirepo_contract_rc" -ne 0 ]; then
      echo "  ⚠️  $multirepo_repo 的契约版本来源不可读:$multirepo_contract"
      if [ "$multirepo_contract_rc" -eq 4 ]; then
        add_scan_boundary "symlink" "$multirepo_contract" \
          "the mapped contract version source was not read"
      elif [ "$multirepo_contract_rc" -eq 5 ]; then
        add_scan_boundary "permission" "$multirepo_contract" \
          "the mapped contract version source was not readable"
      else
        add_finding "sync.unverified" "unverified" "Repo=$multirepo_repo contract version source is not a readable in-root file: $multirepo_contract." "$multirepo_contract"
      fi
      multirepo_issue=1
    else
      multirepo_contract_version="$(read_contract_snapshot_version "$multirepo_contract" || true)"
      if [ -z "$multirepo_contract_version" ]; then
        echo "  ⚠️  $multirepo_contract 缺少唯一可解析的契约快照版本"
        add_finding "sync.unverified" "unverified" "Repo=$multirepo_repo contract source has no unique parseable snapshot version." "$multirepo_contract"
        multirepo_issue=1
      else
        multirepo_contract_ok=1
      fi
    fi

    multirepo_baseline="$SDIR/bus-baseline.json"
    if [ "$multirepo_deployment" != "n/a" ]; then
      multirepo_baseline_real="$(realpath "$multirepo_baseline" 2>/dev/null || true)"
      if ! command -v jq >/dev/null 2>&1; then
        echo "  ⚠️  $multirepo_repo 的部署基线需 jq 才能核对"
        add_finding "sync.unverified" "unverified" "Repo=$multirepo_repo deployment source requires jq: $multirepo_baseline#apps.$multirepo_deployment.imageTag." "$multirepo_baseline"
        multirepo_issue=1
      elif [ -L "$multirepo_baseline" ] \
          || { [ -e "$multirepo_baseline" ] \
            && path_uses_symlink_component "$ROOT_PHYS/$multirepo_baseline"; }; then
        echo "  ⚠️  $multirepo_repo 的部署基线经 symlink 到达,未读取"
        add_scan_boundary "symlink" "$multirepo_baseline" \
          "the deployment baseline was not read"
        multirepo_issue=1
      elif [ -e "$multirepo_baseline" ] && [ ! -r "$multirepo_baseline" ]; then
        echo "  ⚠️  $multirepo_repo 的部署基线当前权限不足,未读取"
        add_scan_boundary "permission" "$multirepo_baseline" \
          "the deployment baseline was not readable"
        multirepo_issue=1
      elif [ ! -f "$multirepo_baseline" ] || [ -z "$multirepo_baseline_real" ]; then
        echo "  ⚠️  $multirepo_repo 的部署基线不可读:$multirepo_baseline"
        add_finding "sync.unverified" "unverified" "Repo=$multirepo_repo deployment baseline is missing or not a regular file: $multirepo_baseline." "$multirepo_baseline"
        multirepo_issue=1
      else
        case "$multirepo_baseline_real" in
          "$ROOT_PHYS"/*)
            multirepo_deployment_version="$(jq -er --arg app "$multirepo_deployment" \
              '.apps[$app].imageTag | select(type == "string" and length > 0)' \
              "$multirepo_baseline" 2>/dev/null || true)"
            if [ -z "$multirepo_deployment_version" ] || ! is_release_version_token "$multirepo_deployment_version"; then
              echo "  ⚠️  $multirepo_baseline#apps.$multirepo_deployment.imageTag 缺少可核对版本"
              add_finding "sync.unverified" "unverified" "Repo=$multirepo_repo deployment baseline has no parseable imageTag at apps.$multirepo_deployment." "$multirepo_baseline"
              multirepo_issue=1
            else
              multirepo_deployment_ok=1
            fi
            ;;
          *)
            echo "  ⚠️  $multirepo_repo 的部署基线解析到协调根之外"
            add_finding "sync.unverified" "unverified" "Repo=$multirepo_repo deployment baseline resolves outside the coordination root." "$multirepo_baseline"
            multirepo_issue=1
            ;;
        esac
      fi
    fi

    if [ "$multirepo_changelog_ok" -eq 1 ] && [ "$multirepo_contract_ok" -eq 1 ]; then
      multirepo_changelog_normalized="$(normalize_release_version "$multirepo_changelog_version")"
      multirepo_contract_normalized="$(normalize_release_version "$multirepo_contract_version")"
      [ "$multirepo_changelog_normalized" = "$multirepo_contract_normalized" ] || multirepo_drift=1
    fi
    if [ "$multirepo_deployment" != "n/a" ] \
        && [ "$multirepo_deployment_ok" -eq 1 ] \
        && [ "$multirepo_changelog_ok" -eq 1 ]; then
      multirepo_deployment_normalized="$(normalize_release_version "$multirepo_deployment_version")"
      multirepo_changelog_normalized="$(normalize_release_version "$multirepo_changelog_version")"
      [ "$multirepo_deployment_normalized" = "$multirepo_changelog_normalized" ] || multirepo_drift=1
    fi
    if [ "$multirepo_deployment" != "n/a" ] \
        && [ "$multirepo_deployment_ok" -eq 1 ] \
        && [ "$multirepo_contract_ok" -eq 1 ]; then
      multirepo_deployment_normalized="$(normalize_release_version "$multirepo_deployment_version")"
      multirepo_contract_normalized="$(normalize_release_version "$multirepo_contract_version")"
      [ "$multirepo_deployment_normalized" = "$multirepo_contract_normalized" ] || multirepo_drift=1
    fi

    if [ "$multirepo_drift" -eq 1 ]; then
      multirepo_changelog_fact="${multirepo_changelog_version:-unverified}"
      multirepo_contract_fact="${multirepo_contract_version:-unverified}"
      multirepo_deployment_fact="n/a"
      [ "$multirepo_deployment" = "n/a" ] \
        || multirepo_deployment_fact="$multirepo_baseline#apps.$multirepo_deployment.imageTag=${multirepo_deployment_version:-unverified}"
      echo "  ⚠️  $multirepo_repo 版本漂移: $multirepo_changelog=$multirepo_changelog_fact ↔ $multirepo_contract=$multirepo_contract_fact ↔ $multirepo_deployment_fact"
      add_finding "sync.multirepo_drift" "conflict" "Version sources disagree for repo=$multirepo_repo: $multirepo_changelog=$multirepo_changelog_fact; $multirepo_contract=$multirepo_contract_fact; $multirepo_deployment_fact." "$multirepo_changelog"
    elif [ "$multirepo_issue" -eq 0 ]; then
      if [ "$multirepo_deployment" = "n/a" ]; then
        echo "  ✅ $multirepo_repo 多仓版本一致: $multirepo_changelog ↔ $multirepo_contract (deployment=n/a)"
      else
        echo "  ✅ $multirepo_repo 多仓版本一致: $multirepo_changelog ↔ $multirepo_contract ↔ $multirepo_baseline#apps.$multirepo_deployment.imageTag"
      fi
    fi
  done < "$multirepo_records"
}

check_stack_drift() {
  stack_path="standards/STACK.md"
  stack_baseline_raw="$BUS_TMP/stack.baseline.raw"
  stack_expected_node="$BUS_TMP/stack.expected.node"
  stack_expected_lockfile="$BUS_TMP/stack.expected.lockfile"
  stack_expected_docker="$BUS_TMP/stack.expected.docker"
  stack_actual_node="$BUS_TMP/stack.actual.node"
  stack_actual_lockfile="$BUS_TMP/stack.actual.lockfile"
  stack_actual_docker="$BUS_TMP/stack.actual.docker"
  stack_files="$BUS_TMP/stack.files"
  stack_find_errors="$BUS_TMP/stack.find-errors"
  : > "$stack_expected_node"
  : > "$stack_expected_lockfile"
  : > "$stack_expected_docker"
  : > "$stack_actual_node"
  : > "$stack_actual_lockfile"
  : > "$stack_actual_docker"
  : > "$stack_files"
  : > "$stack_find_errors"

  # The baseline is deliberately a tiny line protocol rather than inferred
  # prose. Repeated keys form sets; n/a is valid only as the sole value.
  if ! awk '
    $0 == "<!-- buildbeat-stack-baseline:v1" || $0 == "<!-- solobaton-stack-baseline:v1" {
      starts++
      if (inside) bad=1
      inside=1
      next
    }
    inside && $0 == "-->" {
      closes++
      inside=0
      next
    }
    inside { print }
    END {
      if (starts != 1 || closes != 1 || inside || bad) exit 2
    }
  ' "$stack_path" > "$stack_baseline_raw"; then
    echo "  ⚠️  $stack_path 缺少唯一可解析的 buildbeat-stack-baseline:v1 基线块（兼容旧 solobaton 标记）"
    add_finding "stack.unverified" "unverified" "Confirmed STACK.md has no unique parseable v1 observable baseline." "$stack_path"
    return
  fi

  stack_baseline_invalid=0
  while IFS= read -r stack_line || [ -n "$stack_line" ]; do
    stack_line="${stack_line%$'\r'}"
    [ -n "$stack_line" ] || continue
    case "$stack_line" in
      nodeConstraint=*) stack_value="${stack_line#nodeConstraint=}"; stack_value_file="$stack_expected_node" ;;
      lockfileKind=*) stack_value="${stack_line#lockfileKind=}"; stack_value_file="$stack_expected_lockfile" ;;
      dockerFromImage=*) stack_value="${stack_line#dockerFromImage=}"; stack_value_file="$stack_expected_docker" ;;
      *) stack_baseline_invalid=1; continue ;;
    esac
    stack_trimmed="$(printf '%s' "$stack_value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    case "$stack_value" in *$'\t'*) stack_baseline_invalid=1; continue ;; esac
    if [ -z "$stack_value" ] || [ "$stack_value" != "$stack_trimmed" ] \
        || [ "${#stack_value}" -gt 200 ] \
        || printf '%s' "$stack_value" | grep -Eq '<[^>]+>'; then
      stack_baseline_invalid=1
      continue
    fi
    printf '%s\n' "$stack_value" >> "$stack_value_file"
  done < "$stack_baseline_raw"

  for stack_expected_file in "$stack_expected_node" "$stack_expected_lockfile" "$stack_expected_docker"; do
    LC_ALL=C sort -u "$stack_expected_file" -o "$stack_expected_file"
    stack_expected_count="$(awk 'NF { n++ } END { print n+0 }' "$stack_expected_file")"
    if [ "$stack_expected_count" -eq 0 ]; then
      stack_baseline_invalid=1
    elif grep -Fxq 'n/a' "$stack_expected_file" && [ "$stack_expected_count" -ne 1 ]; then
      stack_baseline_invalid=1
    fi
  done
  if [ "$stack_baseline_invalid" -eq 1 ]; then
    echo "  ⚠️  $stack_path 的 v1 可核对基线键值不完整或不唯一"
    add_finding "stack.unverified" "unverified" "Confirmed STACK.md has an incomplete or ambiguous v1 observable baseline." "$stack_path"
    return
  fi

  stack_global_issue=0
  stack_node_issue=0
  stack_lockfile_issue=0
  stack_docker_issue=0
  stack_find_failed=0
  stack_limit_reached=0
  stack_limit="${BUS_STACK_MAX:-200}"
  case "$stack_limit" in
    ''|*[!0-9]*) stack_limit=200; stack_global_issue=1 ;;
    *) [ "$stack_limit" -ge 1 ] || { stack_limit=200; stack_global_issue=1; } ;;
  esac

  if ! find -P . \
      \( -type d \( -name .claude -o -name .codex -o -name .git -o -name .buildbeat -o -name .solobaton \
        -o -name .next -o -name .nuxt -o -name .output -o -name build -o -name coverage \
        -o -name dist -o -name node_modules -o -name target -o -name vendor \) -prune \) -o \
      \( -type l -o \( -type f \( -name .nvmrc -o -name package.json \
        -o -name package-lock.json -o -name npm-shrinkwrap.json -o -name pnpm-lock.yaml \
        -o -name yarn.lock -o -name bun.lock -o -name bun.lockb \
        -o -name Dockerfile -o -name 'Dockerfile.*' \) \) \) -print0 \
      > "$stack_files" 2> "$stack_find_errors"; then
    stack_global_issue=1
    stack_find_failed=1
  fi
  if [ -s "$stack_find_errors" ]; then
    stack_global_issue=1
    stack_find_failed=1
  fi

  stack_scan_count=0
  while IFS= read -r -d '' stack_file; do
    stack_scan_count=$((stack_scan_count + 1))
    if [ "$stack_scan_count" -gt "$stack_limit" ]; then
      stack_global_issue=1
      stack_limit_reached=1
      break
    fi
    stack_base="${stack_file##*/}"

    if [ -L "$stack_file" ]; then
      case "$stack_base" in
        .claude|.codex|.git|.buildbeat|.solobaton|.next|.nuxt|.output|build|coverage|dist|node_modules|target|vendor)
          continue
          ;;
      esac
      if [ -d "$stack_file" ]; then
        stack_global_issue=1
        add_scan_boundary "symlink" "${stack_file#./}" \
          "a directory in the STACK observation scope was not traversed"
      else
        case "$stack_base" in
          .nvmrc|package.json)
            stack_node_issue=1
            add_scan_boundary "symlink" "${stack_file#./}" \
              "a Node version source was not read"
            ;;
          package-lock.json|npm-shrinkwrap.json|pnpm-lock.yaml|yarn.lock|bun.lock|bun.lockb)
            stack_lockfile_issue=1
            add_scan_boundary "symlink" "${stack_file#./}" \
              "a lockfile source was not read"
            ;;
          Dockerfile|Dockerfile.*)
            stack_docker_issue=1
            add_scan_boundary "symlink" "${stack_file#./}" \
              "a Docker FROM source was not read"
            ;;
        esac
      fi
      continue
    fi

    case "$stack_base" in
      .nvmrc)
        if [ ! -r "$stack_file" ]; then
          stack_node_issue=1
          add_scan_boundary "permission" "${stack_file#./}" \
            "a Node version source was not readable"
          continue
        fi
        stack_nvmrc_count="$(awk 'NF { n++ } END { print n+0 }' "$stack_file" 2>/dev/null || echo 0)"
        if [ "$stack_nvmrc_count" -ne 1 ]; then
          stack_node_issue=1
          continue
        fi
        stack_value="$(awk 'NF { sub(/\r$/, ""); sub(/^[[:space:]]+/, ""); sub(/[[:space:]]+$/, ""); print; exit }' "$stack_file" 2>/dev/null || true)"
        if [ -n "$stack_value" ]; then printf '%s\n' "$stack_value" >> "$stack_actual_node"
        else stack_node_issue=1
        fi
        ;;
      package.json)
        if [ ! -r "$stack_file" ] || ! command -v python3 >/dev/null 2>&1; then
          stack_node_issue=1
          if [ ! -r "$stack_file" ]; then
            add_scan_boundary "permission" "${stack_file#./}" \
              "a package manifest was not readable"
          fi
          continue
        fi
        stack_package_status=0
        stack_value="$(python3 - "$stack_file" <<'PY'
import json
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        package = json.load(handle)
except (OSError, UnicodeError, json.JSONDecodeError):
    raise SystemExit(2)

engines = package.get("engines")
if engines is None:
    raise SystemExit(0)
if not isinstance(engines, dict):
    raise SystemExit(2)
value = engines.get("node")
if value is None:
    raise SystemExit(0)
if not isinstance(value, str) or not value.strip() or "\n" in value or "\r" in value:
    raise SystemExit(2)
print(value.strip())
PY
        )" || stack_package_status=$?
        if [ "$stack_package_status" -ne 0 ]; then
          stack_node_issue=1
        elif [ -n "$stack_value" ]; then
          printf '%s\n' "$stack_value" >> "$stack_actual_node"
        fi
        ;;
      package-lock.json|npm-shrinkwrap.json|pnpm-lock.yaml|yarn.lock|bun.lock|bun.lockb)
        if [ -r "$stack_file" ]; then printf '%s\n' "$stack_base" >> "$stack_actual_lockfile"
        else
          stack_lockfile_issue=1
          add_scan_boundary "permission" "${stack_file#./}" \
            "a lockfile source was not readable"
        fi
        ;;
      Dockerfile|Dockerfile.*)
        if [ ! -r "$stack_file" ]; then
          stack_docker_issue=1
          add_scan_boundary "permission" "${stack_file#./}" \
            "a Docker FROM source was not readable"
          continue
        fi
        stack_from_values="$(awk '
          /^[[:space:]]*[Ff][Rr][Oo][Mm][[:space:]]+/ {
            line=$0
            sub(/^[[:space:]]*[Ff][Rr][Oo][Mm][[:space:]]+/, "", line)
            sub(/^--platform=[^[:space:]]+[[:space:]]+/, "", line)
            split(line, fields, /[[:space:]]+/)
            print fields[1]
          }
        ' "$stack_file" 2>/dev/null || true)"
        if [ -z "$stack_from_values" ]; then
          stack_docker_issue=1
          continue
        fi
        while IFS= read -r stack_value; do
          case "$stack_value" in
            ''|*'$'*) stack_docker_issue=1 ;;
            *)
              if printf '%s' "$stack_value" | grep -Fq "\\"; then stack_docker_issue=1
              else printf '%s\n' "$stack_value" >> "$stack_actual_docker"
              fi
              ;;
          esac
        done <<< "$stack_from_values"
        ;;
    esac
  done < "$stack_files"

  if [ "$stack_find_failed" -eq 1 ]; then
    add_scan_boundary "permission" "." \
      "filesystem traversal for STACK observations returned an unreadable or I/O boundary"
  fi
  if [ "$stack_limit_reached" -eq 1 ]; then
    add_scan_boundary "limit" "." \
      "the STACK observation scan stopped at BUS_STACK_MAX=$stack_limit"
  fi

  LC_ALL=C sort -u "$stack_actual_node" -o "$stack_actual_node"
  LC_ALL=C sort -u "$stack_actual_lockfile" -o "$stack_actual_lockfile"
  LC_ALL=C sort -u "$stack_actual_docker" -o "$stack_actual_docker"

  stack_drift_dims=""
  stack_unverified_dims=""
  for stack_dimension in node lockfile docker; do
    case "$stack_dimension" in
      node) stack_label="Node constraints"; stack_expected="$stack_expected_node"; stack_actual="$stack_actual_node"; stack_issue="$stack_node_issue" ;;
      lockfile) stack_label="lockfile kinds"; stack_expected="$stack_expected_lockfile"; stack_actual="$stack_actual_lockfile"; stack_issue="$stack_lockfile_issue" ;;
      docker) stack_label="Docker FROM images"; stack_expected="$stack_expected_docker"; stack_actual="$stack_actual_docker"; stack_issue="$stack_docker_issue" ;;
    esac
    [ "$stack_global_issue" -eq 0 ] || stack_issue=1

    stack_dimension_drift=0
    stack_dimension_unverified=0
    if [ -s "$stack_actual" ]; then
      cmp -s "$stack_expected" "$stack_actual" || stack_dimension_drift=1
      [ "$stack_issue" -eq 0 ] || stack_dimension_unverified=1
    elif grep -Fxq 'n/a' "$stack_expected"; then
      [ "$stack_issue" -eq 0 ] || stack_dimension_unverified=1
    else
      stack_dimension_unverified=1
    fi

    if [ "$stack_dimension_drift" -eq 1 ]; then
      [ -z "$stack_drift_dims" ] || stack_drift_dims="$stack_drift_dims, "
      stack_drift_dims="$stack_drift_dims$stack_label"
    fi
    if [ "$stack_dimension_unverified" -eq 1 ]; then
      [ -z "$stack_unverified_dims" ] || stack_unverified_dims="$stack_unverified_dims, "
      stack_unverified_dims="$stack_unverified_dims$stack_label"
    fi
  done

  if [ -n "$stack_drift_dims" ]; then
    echo "  ❌ $stack_path 与已扫描仓库事实冲突（${stack_drift_dims}）"
    add_finding "stack.drift" "conflict" "Declared STACK baseline conflicts with observed repository facts for: $stack_drift_dims." "$stack_path"
  fi
  if [ -n "$stack_unverified_dims" ]; then
    echo "  ⚠️  $stack_path 的漂移检查未完整覆盖（${stack_unverified_dims}）"
    add_finding "stack.unverified" "unverified" "STACK drift coverage is incomplete for: $stack_unverified_dims." "$stack_path"
  fi
  if [ -z "$stack_drift_dims" ] && [ -z "$stack_unverified_dims" ]; then
    echo "  ✅ $stack_path 可核对基线与已扫描仓库事实一致"
  fi
}

finalize_findings() {
  tab="$(printf '\t')"
  LC_ALL=C sort -t "$tab" -k1,1n -k5,5 -k2,2 "$FINDINGS_RAW" \
    | awk '!seen[$0]++' > "$FINDINGS_SORTED"
}

render_json_report() {
  awk -F '\t' -v strict="$STRICT" '
    function esc(s) {
      gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s)
      gsub(/\r/, "\\r", s); gsub(/\t/, "\\t", s)
      return s
    }
    {
      n++; code[n]=$2; level[n]=$3; message[n]=$4; path[n]=$5
      count[$3]++
      if ($3=="conflict" || $3=="error") blocked=1
      if ($3=="unverified" && !reason_seen[$2]++) reason[++reason_n]=$2
    }
    END {
      ok_value = blocked ? "false" : "true"
      coverage_value = reason_n ? "false" : "true"
      strict_enabled = strict==1 ? "true" : "false"
      strict_blocked = (strict==1 && blocked) ? "true" : "false"
      print "{"
      print "  \"schemaVersion\": 1,"
      print "  \"command\": \"bus-check\","
      printf "  \"ok\": %s,\n", ok_value
      print "  \"target\": \".\","
      print "  \"findings\": ["
      for (i=1; i<=n; i++) {
        printf "    {\"code\":\"%s\",\"level\":\"%s\",\"message\":\"%s\"", esc(code[i]), esc(level[i]), esc(message[i])
        if (path[i] != "") printf ",\"path\":\"%s\"", esc(path[i])
        suffix = ""; if (i<n) suffix = ","
        printf "}%s\n", suffix
      }
      print "  ],"
      printf "  \"summary\": {\"confirmed\":%d,\"warning\":%d,\"unverified\":%d,\"conflict\":%d,\"error\":%d},\n", count["confirmed"]+0, count["warning"]+0, count["unverified"]+0, count["conflict"]+0, count["error"]+0
      printf "  \"coverage\": {\"complete\":%s,\"reasons\":[", coverage_value
      for (i=1; i<=reason_n; i++) {
        suffix = ""; if (i<reason_n) suffix = ","
        printf "\"%s\"%s", esc(reason[i]), suffix
      }
      print "]},"
      printf "  \"strict\": {\"enabled\":%s,\"blocked\":%s}\n", strict_enabled, strict_blocked
      print "}"
    }
  ' "$FINDINGS_SORTED"
}

SUBREPOS=()   # 留空自动发现;或写死:SUBREPOS=("仓1" "目录/仓2")

echo "════════ 协作总线 开工同步 (bus-check) ════════"
echo "▸ 工作区: $ROOT   (协调层脚本: $SDIR/)"   # 打印解析结果:根认错了(嵌套项目/骨架没建)一眼能看出,不静默
echo ""

# 1) meta 仓是否落后远端
if [ "${BUS_CHECK_NO_FETCH:-0}" = "1" ]; then
  add_finding "sync.unverified" "unverified" "Remote synchronization checks were skipped by BUS_CHECK_NO_FETCH=1." "."
elif ! git fetch --quiet 2>/dev/null; then
  add_finding "sync.unverified" "unverified" "The meta-repository fetch failed; remote synchronization is not verified." "."
fi
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
  subrepo_display="${r#./}"
  if path_uses_symlink_component "$ROOT_PHYS/$subrepo_display"; then
    echo "  ⚠️  $subrepo_display 经 symlink 到达,远端同步未检查"
    add_scan_boundary "symlink" "$subrepo_display" \
      "the discovered repository was not traversed"
    continue
  fi
  if [ ! -r "$r" ] || [ ! -x "$r" ]; then
    echo "  ⚠️  $subrepo_display 当前权限不足,远端同步未检查"
    add_scan_boundary "permission" "$subrepo_display" \
      "the discovered repository was not readable and searchable"
    continue
  fi
  if [ "${BUS_CHECK_NO_FETCH:-0}" != "1" ] && ! git -C "$r" fetch --quiet 2>/dev/null; then
    add_finding "sync.unverified" "unverified" "A sub-repository fetch failed; remote synchronization is not verified." "$subrepo_display"
  fi
  if git -C "$r" rev-parse '@{u}' >/dev/null 2>&1; then
    ahead=$(git -C "$r" rev-list --count '@{u}..HEAD' 2>/dev/null || echo "?")
    behind=$(git -C "$r" rev-list --count 'HEAD..@{u}' 2>/dev/null || echo "?")
    head_h=$(git -C "$r" rev-parse --short HEAD 2>/dev/null || echo "?")
    flag="✅"; { [ "$behind" != "0" ] || [ "$ahead" != "0" ]; } && flag="⚠️ "
    printf "  %s %-32s HEAD %s  领先 %s / 落后 %s\n" "$flag" "$subrepo_display" "$head_h" "$ahead" "$behind"
  else
    printf "  ·  %-32s (无上游)\n" "$subrepo_display"
  fi
done
echo ""

# 1.6) Multi-repo version/contract/deployment joins. Only explicit map rows can
# establish equality; every missing/unmapped source remains visible as unverified.
echo "── 多仓版本 / 契约 / 部署基线 ──"
check_multirepo_drift
echo ""

# 1.7) 机器闸自检(一道闸的强度不超过守闸规则的强度 —— 用在跑的闸守新闸;.git/hooks 不进版本控制,克隆后闸不存在)
echo "── 机器闸自检 (pre-commit) ──"
gate_missing=""; gate_checked=0
for r in . "${SUBREPOS[@]:-}"; do
  [ -n "$r" ] || continue; [ -e "$r/.git" ] || continue
  if [ "$r" != "." ]; then
    path_uses_symlink_component "$ROOT_PHYS/${r#./}" && continue
    if [ ! -r "$r" ] || [ ! -x "$r" ]; then continue; fi
  fi
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
now_scan_ok=0
if [ -f pm/NOW.md ]; then
  if [ -L pm/NOW.md ] \
      || path_uses_symlink_component "$ROOT_PHYS/pm/NOW.md"; then
    echo "  (pm/NOW.md 经 symlink 到达,未读取)"
    add_scan_boundary "symlink" "pm/NOW.md" \
      "the live coordination pointer was not read"
  elif [ ! -r pm/NOW.md ]; then
    echo "  (pm/NOW.md 当前权限不足,未读取)"
    add_scan_boundary "permission" "pm/NOW.md" \
      "the live coordination pointer was not readable"
  else
    now_scan_ok=1
  fi
fi
if [ "$now_scan_ok" -eq 1 ]; then
  grep -m1 "^\*\*当前期" pm/NOW.md 2>/dev/null || echo "  (NOW.md 无「当前期」行)"
  grep -m1 "本期轨道" pm/NOW.md 2>/dev/null || true
  grep -m1 "当期看板" pm/NOW.md 2>/dev/null || true
fi
echo ""

# 2.5) 协调层腐烂检测(仪式没有护栏 = 没有仪式;阈值可用 env 调:BUS_NOW_MAX / BUS_STATUS_MAX)
echo "── 协调层腐烂检测 ──"
cur_board=""
board_scan_ok=0
if [ ! -f pm/NOW.md ]; then
  echo "  (pm/NOW.md 不存在 —— 无法判定,先按模板建骨架)"
  add_finding "ref.broken" "conflict" "pm/NOW.md is missing." "pm/NOW.md"
elif [ "$now_scan_ok" -eq 0 ]; then
  echo "  (pm/NOW.md 未读取;协调层腐烂检测保持 unverified)"
else
  rot=0; board_note=""
  NOW_MAX="${BUS_NOW_MAX:-40}"; ST_MAX="${BUS_STATUS_MAX:-60}"
  # a) NOW 薄指针长肥(BuildBeat lessons 第 1 条:NOW 长肥 = 腐烂开端)
  now_lines=$(wc -l < pm/NOW.md | tr -d ' ')
  if [ "$now_lines" -gt "$NOW_MAX" ]; then
    echo "  ⚠️  pm/NOW.md 已 $now_lines 行(>$NOW_MAX)—— 薄指针长肥,跑换期压缩仪式(NOW 底部 checklist)"; rot=1
    add_finding "sync.now_bloated" "conflict" "pm/NOW.md exceeds the configured live-file limit ($now_lines > $NOW_MAX)." "pm/NOW.md"
  fi
  # b) 当期看板存在性 + 非当期看板滞留 pm/(该 git mv 进 archive/<期>/)
  # shellcheck disable=SC2016 # single quotes intentionally protect the backticks in the sed pattern
  cur_board=$(grep -m1 "当期看板" pm/NOW.md 2>/dev/null | sed -n 's/.*`\([^`]*看板[^`]*\.md\)`.*/\1/p')
  cur_board=$(basename "${cur_board:-}" 2>/dev/null)
  case "$cur_board" in *"<"*) cur_board="";; esac   # NOW 还是占位符 → 判不了
  if [ -z "$cur_board" ]; then
    board_note="(NOW 未填当期看板,看板检查跳过)"
    add_finding "sync.unverified" "unverified" "The current-board pointer cannot be determined from pm/NOW.md." "pm/NOW.md"
  else
    if [ ! -f "pm/$cur_board" ]; then
      echo "  ⚠️  NOW 指向的当期看板 pm/$cur_board 不存在 —— 坏指针,先修 NOW"
      add_finding "ref.broken" "conflict" "The current-board pointer does not resolve." "pm/$cur_board"
      rot=1
    elif [ -L "pm/$cur_board" ] \
        || path_uses_symlink_component "$ROOT_PHYS/pm/$cur_board"; then
      echo "  ⚠️  pm/$cur_board 经 symlink 到达,未读取"
      add_scan_boundary "symlink" "pm/$cur_board" \
        "the current board was not read"
      rot=1
    elif [ ! -r "pm/$cur_board" ]; then
      echo "  ⚠️  pm/$cur_board 当前权限不足,未读取"
      add_scan_boundary "permission" "pm/$cur_board" \
        "the current board was not readable"
      rot=1
    else
      board_scan_ok=1
    fi
    for b in pm/*看板*.md; do
      { [ -e "$b" ] || [ -L "$b" ]; } || continue
      base="$(basename "$b")"
      [ "$base" = "$cur_board" ] || {
        echo "  ⚠️  $base 不是当期看板还留在 pm/ —— 归档进 pm/archive/<期>/"
        add_finding "sync.now_bloated" "conflict" "A non-current board remains in the live pm directory." "pm/$base"
        rot=1
      }
    done
  fi
  # c) status 文件超长(该截断:全文快照进 archive,live 只留基线+最近一条)
  for f in pm/status/*.md; do
    { [ -e "$f" ] || [ -L "$f" ]; } || continue
    base="$(basename "$f")"; [ "$base" = "README.md" ] && continue
    if [ -L "$f" ] || path_uses_symlink_component "$ROOT_PHYS/$f"; then
      echo "  ⚠️  pm/status/$base 经 symlink 到达,未读取"
      add_scan_boundary "symlink" "pm/status/$base" \
        "a live status file was not read"
      rot=1
      continue
    fi
    if [ ! -r "$f" ]; then
      echo "  ⚠️  pm/status/$base 当前权限不足,未读取"
      add_scan_boundary "permission" "pm/status/$base" \
        "a live status file was not readable"
      rot=1
      continue
    fi
    n=$(wc -l < "$f" | tr -d ' ')
    [ "$n" -le "$ST_MAX" ] || {
      echo "  ⚠️  pm/status/$base 已 $n 行(>$ST_MAX)—— 换期压缩仪式该截断了"
      add_finding "sync.now_bloated" "conflict" "A live status file exceeds the configured limit ($n > $ST_MAX)." "pm/status/$base"
      rot=1
    }
  done
  if [ "$rot" = 0 ]; then
    if [ -n "$board_note" ]; then echo "  ✅ NOW 薄、status 克制 $board_note"
    else echo "  ✅ NOW 薄、看板归位、status 克制"; fi
  fi
fi
echo ""

# 2.6) canonical Gate / completed-WP evidence / scoped local references
echo "── Gate / 完成证据 / 作用域引用 ──"
board_path=""
if [ "$board_scan_ok" -eq 1 ]; then
  board_path="pm/$cur_board"
fi

if [ -n "$board_path" ]; then
  for gate_n in 1 2 3 4; do
    gate_lines="$(grep -nE "^[[:space:]]*- Gate${gate_n}:" "$board_path" 2>/dev/null || true)"
    gate_count="$(printf '%s\n' "$gate_lines" | awk 'NF { n++ } END { print n+0 }')"
    if [ "$gate_count" -eq 0 ]; then
      echo "  ⚠️  Gate${gate_n} 缺少 canonical 状态行(legacy 看板可继续读,但不可机器判定)"
      add_finding "gate.line_missing" "warning" "Gate${gate_n} canonical state line is missing." "$board_path"
      continue
    fi
    if [ "$gate_count" -ne 1 ]; then
      echo "  ❌ Gate${gate_n} 状态行出现 $gate_count 次 —— protocol 无法唯一判定"
      add_finding "gate.invalid" "error" "Gate${gate_n} must appear exactly once; found $gate_count lines." "$board_path"
      continue
    fi

    gate_line="${gate_lines#*:}"
    if ! printf '%s\n' "$gate_line" | grep -Eq "^[[:space:]]*- Gate${gate_n}: (pending|passed|blocked|n/a)([[:space:]]*\|.*)?[[:space:]]*$"; then
      echo "  ❌ Gate${gate_n} 状态行格式或 state 非法"
      add_finding "gate.invalid" "error" "Gate${gate_n} has a malformed canonical state line." "$board_path"
      continue
    fi
    gate_state="$(printf '%s\n' "$gate_line" | sed -E "s/^[[:space:]]*- Gate${gate_n}: (pending|passed|blocked|n\/a).*/\1/")"

    if [ "$gate_state" = "n/a" ]; then
      # shellcheck disable=SC2016 # backticks are literal Markdown delimiters
      gate_reason="$(printf '%s\n' "$gate_line" | sed -nE 's/.*理由:[[:space:]]*`([^`]*)`.*/\1/p')"
      if [ -z "$gate_reason" ] || printf '%s\n' "$gate_reason" | grep -qE '<[^>]*>'; then
        echo "  ⚠️  Gate${gate_n}=n/a 但缺少同一行的非占位理由"
        add_finding "gate.na_without_reason" "conflict" "Gate${gate_n} is n/a without a non-placeholder reason." "$board_path"
      fi
      if [ "$gate_n" -eq 2 ] && detect_ui_signal; then
        echo "  ⚠️  Gate2=n/a 但仓库存在明确 UI 信号 —— 复核是否应进入 Gate2"
        add_finding "gate.na_inconsistent" "warning" "Gate2 is n/a even though a positive UI signal was detected." "$board_path"
      fi
    fi

    if [ "$gate_state" = "passed" ]; then
      gate_ref_seen=0; gate_ref_valid=0; gate_decision_issue=0
      if printf '%s\n' "$gate_line" | grep -Eq '决策:'; then
        # shellcheck disable=SC2016 # backticks are literal Markdown delimiters
        gate_decision_ref="$(printf '%s\n' "$gate_line" | sed -nE 's/.*决策:[[:space:]]*`([^`]*)`.*/\1/p')"
        if [ -z "$gate_decision_ref" ] || ! validate_decision_reference "$gate_decision_ref"; then
          gate_decision_issue=1
        fi
      fi
      if printf '%s\n' "$gate_line" | grep -Eq '(决策|证据):[[:space:]]*`'; then
        while IFS= read -r gate_ref; do
          [ -n "$gate_ref" ] || continue
          gate_ref_seen=1
          if validate_reference "$gate_ref" "$board_path"; then
            gate_ref_valid=1
          else
            ref_rc=$?
            if [ "$ref_rc" -eq 2 ]; then
              add_finding "sync.unverified" "unverified" "Gate${gate_n} uses a remote reference that was not checked." "$board_path"
            elif [ "$ref_rc" -eq 4 ]; then
              echo "  ⚠️  Gate${gate_n} 引用经 symlink 到达,未读取:$gate_ref"
              add_scan_boundary "symlink" "$(reference_display_path "$gate_ref")" \
                "a local reference was not followed"
            elif [ "$ref_rc" -eq 5 ]; then
              echo "  ⚠️  Gate${gate_n} 引用当前权限不足,未读取:$gate_ref"
              add_scan_boundary "permission" "$(reference_display_path "$gate_ref")" \
                "a local reference was not readable"
            elif [ "$ref_rc" -eq 1 ]; then
              echo "  ⚠️  Gate${gate_n} 引用无法解析:$gate_ref"
              add_finding "ref.broken" "conflict" "Gate${gate_n} reference does not resolve: $gate_ref" "$board_path"
            fi
          fi
        done < <(extract_backtick_tokens "$gate_line")
      fi
      if printf '%s\n' "$gate_line" | grep -Eq '证据:'; then
        # shellcheck disable=SC2016 # backticks are literal Markdown delimiters
        gate_evidence_ref="$(printf '%s\n' "$gate_line" | sed -nE 's/.*证据:[[:space:]]*`([^`]*)`.*/\1/p')"
        if [ -n "$gate_evidence_ref" ] && validate_reference "$gate_evidence_ref" "$board_path"; then
          evidence_location_status "$gate_evidence_ref"
          evidence_location_rc=$?
          if [ "$evidence_location_rc" -eq 1 ]; then
            echo "  ⚠️  Gate${gate_n} 的本地证据未落在 pm/archive/<期>/evidence/"
            add_finding "evidence.outside_archive" "warning" "Gate${gate_n} uses a local evidence path outside pm/archive/<period>/evidence/." "$board_path"
          fi
        fi
      fi
      if [ "$gate_decision_issue" -eq 1 ]; then
        echo "  ⚠️  Gate${gate_n}=passed 的决策引用未指向 pm/decisions.md 有效决策行"
        add_finding "gate.pass_untraceable" "warning" "Gate${gate_n} has a decision reference that does not identify an existing decisions.md row." "$board_path"
      elif [ "$gate_ref_seen" -eq 0 ] || [ "$gate_ref_valid" -eq 0 ]; then
        echo "  ⚠️  Gate${gate_n}=passed 但没有可追溯的决策/证据引用"
        add_finding "gate.pass_untraceable" "warning" "Gate${gate_n} is passed without a traceable decision or evidence reference." "$board_path"
      fi
    fi
  done

  while IFS=$'\t' read -r wp_title evidence_count evidence_line; do
    [ -n "$wp_title" ] || continue
    if [ "$evidence_count" -ne 1 ]; then
      echo "  ⚠️  $wp_title 已完成但 **证据** 行数量为 $evidence_count(要求恰好 1)"
      add_finding "evidence.missing" "conflict" "$wp_title is complete but does not have exactly one canonical evidence line." "$board_path"
      continue
    fi
    if [ -z "$evidence_line" ] || printf '%s\n' "$evidence_line" | grep -qE '<[^>]*>|待补|TBD'; then
      echo "  ⚠️  $wp_title 已完成但证据仍为空或占位符"
      add_finding "evidence.missing" "conflict" "$wp_title is complete but its evidence line is empty or placeholder-only." "$board_path"
      continue
    fi

    evidence_ref_seen=0; evidence_ref_valid=0; evidence_ref_unverified=0
    while IFS= read -r evidence_ref; do
      [ -n "$evidence_ref" ] || continue
      if validate_reference "$evidence_ref" "$board_path"; then
        evidence_ref_seen=1; evidence_ref_valid=1
        evidence_location_status "$evidence_ref"
        evidence_location_rc=$?
        if [ "$evidence_location_rc" -eq 1 ]; then
          echo "  ⚠️  $wp_title 的本地证据未落在 pm/archive/<期>/evidence/"
          add_finding "evidence.outside_archive" "warning" "$wp_title uses a local evidence path outside pm/archive/<period>/evidence/." "$board_path"
        fi
      else
        ref_rc=$?
        if [ "$ref_rc" -eq 2 ]; then
          evidence_ref_seen=1; evidence_ref_unverified=1
          add_finding "sync.unverified" "unverified" "$wp_title uses remote-only evidence that was not checked." "$board_path"
        elif [ "$ref_rc" -eq 4 ]; then
          evidence_ref_seen=1; evidence_ref_unverified=1
          echo "  ⚠️  $wp_title 的证据引用经 symlink 到达,未读取:$evidence_ref"
          add_scan_boundary "symlink" "$(reference_display_path "$evidence_ref")" \
            "a local reference was not followed"
        elif [ "$ref_rc" -eq 5 ]; then
          evidence_ref_seen=1; evidence_ref_unverified=1
          echo "  ⚠️  $wp_title 的证据引用当前权限不足,未读取:$evidence_ref"
          add_scan_boundary "permission" "$(reference_display_path "$evidence_ref")" \
            "a local reference was not readable"
        elif [ "$ref_rc" -eq 1 ]; then
          evidence_ref_seen=1
          echo "  ⚠️  $wp_title 的证据引用无法解析:$evidence_ref"
          add_finding "ref.broken" "conflict" "$wp_title evidence reference does not resolve: $evidence_ref" "$board_path"
        fi
      fi
    done < <(extract_backtick_tokens "$evidence_line")
    if [ "$evidence_ref_seen" -eq 0 ] \
        || { [ "$evidence_ref_valid" -eq 0 ] && [ "$evidence_ref_unverified" -eq 0 ]; }; then
      echo "  ⚠️  $wp_title 已完成但证据行没有可机器核验的路径/hash/URL"
      add_finding "evidence.missing" "conflict" "$wp_title has no machine-verifiable evidence reference." "$board_path"
    fi
  done < <(awk '
    function emit() {
      if (in_wp && done) {
        gsub(/\t/, " ", title); gsub(/\t/, " ", evidence)
        printf "%s\t%d\t%s\n", title, evidence_count, evidence
      }
    }
    /^### WP-/ { emit(); in_wp=1; done=0; evidence_count=0; evidence=""; title=$0; next }
    in_wp && /^#{1,3}[[:space:]]/ { emit(); in_wp=0; next }
    in_wp && /\*\*状态\*\*:/ && /✅完成/ { done=1 }
    in_wp && /\*\*证据\*\*:/ {
      evidence_count++
      evidence = evidence (evidence ? " " : "") $0
    }
    END { emit() }
  ' "$board_path")
else
  echo "  (当期看板不可读;Gate 与完成证据检查跳过)"
fi

ref_limit="${BUS_REF_MAX:-200}"
case "$ref_limit" in ''|*[!0-9]*) ref_limit=200 ;; esac
ref_scanned=0; ref_truncated=0
for ref_source in pm/NOW.md "$board_path" pm/decisions.md; do
  if [ -z "$ref_source" ] || [ ! -f "$ref_source" ]; then continue; fi
  if [ -L "$ref_source" ] \
      || path_uses_symlink_component "$ROOT_PHYS/$ref_source"; then
    echo "  ⚠️  $ref_source 经 symlink 到达,作用域引用未扫描"
    add_scan_boundary "symlink" "$ref_source" \
      "the scoped-reference source was not read"
    continue
  fi
  if [ ! -r "$ref_source" ]; then
    echo "  ⚠️  $ref_source 当前权限不足,作用域引用未扫描"
    add_scan_boundary "permission" "$ref_source" \
      "the scoped-reference source was not readable"
    continue
  fi
  ref_scan_input="$ref_source"
  if [ "$ref_source" = "pm/decisions.md" ]; then
    ref_scan_input="$BUS_TMP/decisions.scope"
    awk '/^\| 20[0-9][0-9]-/ { print; found++; if (found == 3) exit }' "$ref_source" > "$ref_scan_input"
  fi
  while IFS= read -r scoped_ref; do
    [ -n "$scoped_ref" ] || continue
    ref_rc=0
    validate_reference "$scoped_ref" "$ref_source" 1 || ref_rc=$?
    [ "$ref_rc" -ne 3 ] || continue
    ref_scanned=$((ref_scanned + 1))
    if [ "$ref_scanned" -gt "$ref_limit" ]; then
      ref_truncated=1
      break
    fi
    if [ "$ref_rc" -eq 0 ]; then
      :
    elif [ "$ref_rc" -eq 2 ]; then
      add_finding "sync.unverified" "unverified" "A scoped remote reference was not checked." "$ref_source"
    elif [ "$ref_rc" -eq 4 ]; then
      echo "  ⚠️  $ref_source 中的作用域引用经 symlink 到达,未读取:$scoped_ref"
      add_scan_boundary "symlink" "$(reference_display_path "$scoped_ref")" \
        "a local reference was not followed"
    elif [ "$ref_rc" -eq 5 ]; then
      echo "  ⚠️  $ref_source 中的作用域引用当前权限不足,未读取:$scoped_ref"
      add_scan_boundary "permission" "$(reference_display_path "$scoped_ref")" \
        "a local reference was not readable"
    elif [ "$ref_rc" -eq 1 ]; then
      echo "  ⚠️  $ref_source 中的作用域引用无法解析:$scoped_ref"
      add_finding "ref.broken" "conflict" "Scoped reference does not resolve: $scoped_ref" "$ref_source"
    fi
  done < <(
    # shellcheck disable=SC2016 # backticks are literal Markdown delimiters
    grep -oE '\]\([^)]*\)|`[^`]*\.md([^`]*)?`' "$ref_scan_input" 2>/dev/null \
      | sed -E 's/^\]\(//; s/\)$//; s/^`//; s/`$//' \
      | sed -E 's/[[:space:]]+"[^"]*"$//' || true
  )
  [ "$ref_truncated" -eq 0 ] || break
done
if [ "$ref_truncated" -eq 1 ]; then
  echo "  ⚠️  作用域引用扫描达到 BUS_REF_MAX=$ref_limit,剩余范围未核验"
  add_scan_boundary "limit" "pm/" \
    "the scoped reference scan stopped at BUS_REF_MAX=$ref_limit"
fi
[ -n "$board_path" ] && echo "  · 已检查 canonical Gate、完成证据与 $ref_scanned 条作用域引用"
echo ""

# 2.7) 工程层验证能力(证据分级 L3「自动化测试」的前提是项目有能跑的测试;测试跑不动是比 NOW 长肥更重的腐烂)
echo "── 工程层验证能力 ──"
if [ -f "$SDIR/verify-status.sh" ]; then
  if ! bash "$SDIR/verify-status.sh" 2>/dev/null | sed 's/^/  /'; then
    echo "  (verify-status.sh 执行失败)"
    add_finding "sync.unverified" "unverified" "verify-status human report failed." "$SDIR/verify-status.sh"
  fi
  verify_machine="$BUS_TMP/verify.machine"
  if bash "$SDIR/verify-status.sh" --format=machine > "$verify_machine" 2>/dev/null; then
    verify_machine_unknown=0
    while IFS=$'\t' read -r record code level message path; do
      if [ "$record" != "FINDING" ]; then
        [ -z "$record$code$level$message$path" ] || verify_machine_unknown=1
        continue
      fi
      case "$code:$level" in
        sync.l3_stale:warning|sync.l3_unconfigured:unverified)
          add_finding "$code" "$level" "$message" "$path"
          ;;
        *)
          add_finding "sync.unverified" "unverified" "verify-status returned an unknown machine finding." "$SDIR/verify-status.sh"
          ;;
      esac
    done < "$verify_machine"
    if [ "$verify_machine_unknown" -eq 1 ]; then
      add_finding "sync.unverified" "unverified" "verify-status did not return the expected machine protocol." "$SDIR/verify-status.sh"
    fi
  else
    add_finding "sync.unverified" "unverified" "verify-status machine report failed." "$SDIR/verify-status.sh"
  fi
else
  echo "  ⚠️  未配置 $SDIR/verify-status.sh —— 项目验证能力未知,L3 级证据无从谈起(接入:每行输出「套件名 测试命令 上次全绿时间」)"
  add_finding "sync.l3_unconfigured" "unverified" "No verify-status adapter is installed." "$SDIR/verify-status.sh"
fi
echo ""

# 3) 契约快照版本
echo "── 契约 (contracts/PROTOCOL.md) ──"
if [ "${multirepo_map_unsafe:-1}" -eq 0 ]; then
  grep -m1 -E "契约快照对应版本" contracts/PROTOCOL.md 2>/dev/null || echo "  (无)"
else
  echo "  (契约入口缺失或未安全读取)"
fi
echo ""

# 3.5) 可选 standards / ADR。缺失即跳过；存在才检查结构与明确状态。
echo "── 可选规范 / ADR ──"
standard_count=0
stack_standard_status=""
stack_standard_valid=0
for standard_path in standards/STACK.md standards/CODE.md standards/REVIEW.md standards/DESIGN.md; do
  [ -f "$standard_path" ] || continue
  standard_count=$((standard_count + 1))
  if [ -L "$standard_path" ] \
      || path_uses_symlink_component "$ROOT_PHYS/$standard_path"; then
    echo "  ⚠️  $standard_path 经 symlink 到达,可选规范未读取"
    add_scan_boundary "symlink" "$standard_path" \
      "an optional standard was not read"
    continue
  fi
  if [ ! -r "$standard_path" ]; then
    echo "  ⚠️  $standard_path 当前权限不足,可选规范未读取"
    add_scan_boundary "permission" "$standard_path" \
      "an optional standard was not readable"
    continue
  fi
  standard_name="$(basename "$standard_path" .md)"
  standard_invalid=0

  optional_count="$(grep -cE '^> \*\*Optional\*\*:' "$standard_path" 2>/dev/null || true)"
  boundary_count="$(grep -cE '^> \*\*AI write boundary\*\*:' "$standard_path" 2>/dev/null || true)"
  status_lines="$(grep -E '^> \*\*Status\*\*:' "$standard_path" 2>/dev/null || true)"
  status_count="$(printf '%s\n' "$status_lines" | awk 'NF { n++ } END { print n+0 }')"
  standard_status=""
  if [ "$optional_count" -ne 1 ] || [ "$boundary_count" -ne 1 ] || [ "$status_count" -ne 1 ]; then
    standard_invalid=1
  elif ! printf '%s\n' "$status_lines" | grep -Eq '^> \*\*Status\*\*: (Draft|Confirmed)[[:space:]]*$'; then
    standard_invalid=1
  else
    standard_status="$(printf '%s\n' "$status_lines" | sed -E 's/^> \*\*Status\*\*: (Draft|Confirmed).*/\1/')"
  fi

  # shellcheck disable=SC2016 # backticks are literal Markdown delimiters
  rule_tokens="$(grep -E '^[[:space:]]*- `[A-Z]+-(MUST|SHOULD|MAY)-' "$standard_path" 2>/dev/null \
    | grep -oE '`[A-Z]+-(MUST|SHOULD|MAY)-[^`]+`' | tr -d '`' || true)"
  valid_rules=0
  invalid_rule=0
  while IFS= read -r rule_id; do
    [ -n "$rule_id" ] || continue
    if printf '%s\n' "$rule_id" | grep -Eq "^${standard_name}-(MUST|SHOULD|MAY)-[0-9]{3}$"; then
      valid_rules=$((valid_rules + 1))
    else
      invalid_rule=1
    fi
  done <<< "$rule_tokens"
  [ "$valid_rules" -gt 0 ] || invalid_rule=1
  duplicate_rule="$(printf '%s\n' "$rule_tokens" | awk 'NF' | sort | uniq -d | head -1)"
  [ -z "$duplicate_rule" ] || invalid_rule=1
  [ "$invalid_rule" -eq 0 ] || standard_invalid=1

  if [ "$standard_status" = "Confirmed" ] && grep -Eq '<[^>]+>' "$standard_path"; then
    standard_invalid=1
  fi

  while IFS= read -r standard_ref; do
    [ -n "$standard_ref" ] || continue
    standard_ref_rc=0
    validate_reference "$standard_ref" "$standard_path" || standard_ref_rc=$?
    [ "$standard_ref_rc" -ne 1 ] || standard_invalid=1
    if [ "$standard_ref_rc" -eq 4 ]; then
      add_scan_boundary "symlink" "$(reference_display_path "$standard_ref")" \
        "a local reference was not followed"
    elif [ "$standard_ref_rc" -eq 5 ]; then
      add_scan_boundary "permission" "$(reference_display_path "$standard_ref")" \
        "a local reference was not readable"
    fi
  done < <(
    # shellcheck disable=SC2016 # backticks are literal Markdown delimiters
    grep -hoE '`[^`]+`' "$standard_path" 2>/dev/null | sed 's/^`//; s/`$//' || true
  )

  if [ "$standard_invalid" -eq 1 ]; then
    echo "  ❌ $standard_path 结构、Rule ID、已确认占位符或本地引用无效"
    add_finding "standards.invalid" "error" "Optional standard structure, Rule IDs, confirmed placeholders, or local references are invalid." "$standard_path"
  elif [ "$standard_status" = "Draft" ]; then
    echo "  ⚠️  $standard_path 仍是 Draft(待确认)"
    add_finding "standards.unconfirmed" "unverified" "Optional standard is present but still marked Draft." "$standard_path"
  else
    echo "  ✅ $standard_path 结构与 Confirmed 状态可解析"
  fi

  if [ "$standard_name" = "STACK" ]; then
    stack_standard_status="$standard_status"
    [ "$standard_invalid" -eq 1 ] || stack_standard_valid=1
  fi
done
[ "$standard_count" -gt 0 ] || echo "  · standards 未启用(缺失即跳过,零 finding)"
[ "$stack_standard_valid" -eq 0 ] || [ "$stack_standard_status" != "Confirmed" ] || check_stack_drift

adr_count=0
for adr_path in pm/adr/ADR-[0-9][0-9][0-9][0-9]-*.md; do
  [ -f "$adr_path" ] || continue
  adr_count=$((adr_count + 1))
  if [ -L "$adr_path" ] \
      || path_uses_symlink_component "$ROOT_PHYS/$adr_path"; then
    echo "  ⚠️  $adr_path 经 symlink 到达,ADR 未读取"
    add_scan_boundary "symlink" "$adr_path" "an ADR was not read"
    continue
  fi
  if [ ! -r "$adr_path" ]; then
    echo "  ⚠️  $adr_path 当前权限不足,ADR 未读取"
    add_scan_boundary "permission" "$adr_path" "an ADR was not readable"
    continue
  fi
  adr_status_lines="$(grep -E '^- Status:' "$adr_path" 2>/dev/null || true)"
  adr_status_count="$(printf '%s\n' "$adr_status_lines" | awk 'NF { n++ } END { print n+0 }')"
  if [ "$adr_status_count" -ne 1 ] || ! printf '%s\n' "$adr_status_lines" | grep -Eq '^- Status: (Proposed|Accepted|Rejected|Superseded)[[:space:]]*$'; then
    echo "  ❌ $adr_path 缺少唯一合法 Status"
    add_finding "adr.status_invalid" "error" "ADR must contain exactly one legal Status line." "$adr_path"
  fi
done

for adr_path in pm/adr/ADR-[0-9][0-9][0-9][0-9]-*.md; do
  [ -f "$adr_path" ] || continue
  [ ! -L "$adr_path" ] || continue
  path_uses_symlink_component "$ROOT_PHYS/$adr_path" && continue
  [ -r "$adr_path" ] || continue
  initial_status_lines="$(grep -E '^- Status:' "$adr_path" 2>/dev/null || true)"
  initial_status_count="$(printf '%s\n' "$initial_status_lines" | awk 'NF { n++ } END { print n+0 }')"
  if [ "$initial_status_count" -ne 1 ] || ! printf '%s\n' "$initial_status_lines" | grep -Eq '^- Status: (Proposed|Accepted|Rejected|Superseded)[[:space:]]*$'; then
    continue
  fi
  chain_current="$adr_path"
  chain_seen="|$adr_path|"
  chain_steps=0
  chain_broken=0
  while [ "$chain_steps" -lt 100 ]; do
    chain_status_lines="$(grep -E '^- Status:' "$chain_current" 2>/dev/null || true)"
    chain_status_count="$(printf '%s\n' "$chain_status_lines" | awk 'NF { n++ } END { print n+0 }')"
    if [ "$chain_status_count" -ne 1 ] || ! printf '%s\n' "$chain_status_lines" | grep -Eq '^- Status: (Proposed|Accepted|Rejected|Superseded)[[:space:]]*$'; then
      chain_broken=1
      break
    fi
    chain_status="$(printf '%s\n' "$chain_status_lines" | sed -E 's/^- Status: ([A-Za-z]+).*/\1/')"
    [ "$chain_status" = "Superseded" ] || break

    chain_target_lines="$(grep -E '^- Superseded by:' "$chain_current" 2>/dev/null || true)"
    chain_target_count="$(printf '%s\n' "$chain_target_lines" | awk 'NF { n++ } END { print n+0 }')"
    # shellcheck disable=SC2016 # backticks are literal Markdown delimiters
    if [ "$chain_target_count" -ne 1 ] || ! printf '%s\n' "$chain_target_lines" | grep -Eq '^- Superseded by: `pm/adr/ADR-[0-9]{4}-[^`]+\.md`[[:space:]]*$'; then
      chain_broken=1
      break
    fi
    # shellcheck disable=SC2016 # backticks are literal Markdown delimiters
    chain_target="$(printf '%s\n' "$chain_target_lines" | sed -E 's/^- Superseded by: `([^`]*)`.*/\1/')"
    case "$chain_seen" in
      *"|$chain_target|"*) chain_broken=1; break ;;
    esac
    if [ ! -f "$chain_target" ]; then
      chain_broken=1
      break
    fi
    chain_seen="${chain_seen}${chain_target}|"
    chain_current="$chain_target"
    chain_steps=$((chain_steps + 1))
  done
  [ "$chain_steps" -lt 100 ] || chain_broken=1
  if [ "$chain_broken" -eq 1 ]; then
    echo "  ❌ $adr_path 的 Superseded 链缺失、成环或指向非法 ADR"
    add_finding "adr.superseded_broken" "conflict" "ADR supersession chain is missing, cyclic, self-referential, or targets an invalid ADR." "$adr_path"
  fi
done
[ "$adr_count" -gt 0 ] || echo "  · ADR 未启用(缺失即跳过,零 finding)"
echo ""

# 4) 最近拍板 (pm/decisions.md, 规则⑨ 决策单点)
echo "── 最近拍板 (pm/decisions.md, 最新 3 条) ──"
if [ -f pm/decisions.md ] && [ ! -L pm/decisions.md ] && [ -r pm/decisions.md ] \
    && ! path_uses_symlink_component "$ROOT_PHYS/pm/decisions.md"; then
  if command -v perl >/dev/null 2>&1; then
    # perl -CSD -Mutf8 按「字符」截断,避免按字节截断把中文/省略号切成乱码
    grep -E '^\| 20[0-9]{2}-' pm/decisions.md | head -3 | perl -CSD -Mutf8 -ne 'chomp; $_ = substr($_,0,110)."…" if length() > 110; print "  $_\n"'
  else
    grep -E '^\| 20[0-9]{2}-' pm/decisions.md | head -3 | sed 's/^/  /'   # 无 perl:降级为不截断(截字节会把中文切成乱码)
  fi
else
  echo "  (pm/decisions.md 缺失或未安全读取)"
fi
echo ""

# 5) 各域状态文件最近更新
echo "── 各域状态 (pm/status/) ──"
if [ -d pm/status ]; then
  for f in pm/status/*.md; do
    { [ -e "$f" ] || [ -L "$f" ]; } || continue
    base="$(basename "$f")"; [ "$base" = "README.md" ] && continue
    [ ! -L "$f" ] || continue
    path_uses_symlink_component "$ROOT_PHYS/$f" && continue
    [ -r "$f" ] || continue
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
      { [ -e "$f" ] || [ -L "$f" ]; } || continue
      [ "$(basename "$f")" = "README.md" ] && continue
      [ ! -L "$f" ] || continue
      path_uses_symlink_component "$ROOT_PHYS/$f" && continue
      [ -r "$f" ] || continue
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
      if [ "$r" != "." ]; then
        path_uses_symlink_component "$ROOT_PHYS/${r#./}" && continue
        if [ ! -r "$r" ] || [ ! -x "$r" ]; then continue; fi
      fi
      git -C "$r" cat-file -t "$h" >/dev/null 2>&1 && { found=1; break; }
    done
    [ "$found" = 1 ] || {
      echo "  ⚠️  $h —— meta 仓与全部子仓查无此号(幽灵 hash:臆造/被重置/躺工作树没提交;若刚换机器,先 git pull 复核)"
      add_finding "sync.ghost_hash" "conflict" "Status references an unresolved Git hash: $h" "pm/status/"
      ghost=1
    }
  done
  if [ "$ghost" = 0 ] && [ "$total" = 0 ]; then echo "  (status 里暂无 hash)"
  elif [ "$ghost" = 0 ]; then echo "  ✅ $total 个 hash 全部可解析"
  fi
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
  add_finding "sync.unverified" "unverified" "Live status was skipped by BUS_CHECK_NO_LIVE=1." "$SDIR/live-status.sh"
elif [ -f "$SDIR/live-status.sh" ]; then
  if ! bash "$SDIR/live-status.sh" 2>/dev/null | sed 's/^/  /'; then
    echo "  (live-status.sh 执行失败 —— 检查部署平台 CLI 凭据/网络)"
    add_finding "sync.unverified" "unverified" "Live-status adapter failed; production state is not verified." "$SDIR/live-status.sh"
  fi
else
  echo "  (未配置 $SDIR/live-status.sh —— 接入部署平台 CLI 后,每行输出「服务名 版本」即可;在此之前别引用任何文档里的\"当前版本\")"
  add_finding "sync.unverified" "unverified" "No live-status adapter is configured." "$SDIR/live-status.sh"
fi
echo ""

# 7.5) 生产漂移检测(平台侧 env/secret 指纹 + 镜像tag↔git vs scripts/bus-baseline.json)
echo "── 生产漂移检测 ──"
if [ -f "$SDIR/drift-check.sh" ]; then
  drift_output="$(bash "$SDIR/drift-check.sh" $DRIFT_MODE 2>&1)"; drc=$?
  printf '%s\n' "$drift_output"
  if [ "$drc" -eq 2 ]; then
    add_finding "sync.production_drift" "conflict" "The configured drift adapter confirmed production drift." "$SDIR/drift-check.sh"
  elif [ "$drc" -ne 0 ]; then
    add_finding "sync.unverified" "unverified" "The configured drift adapter failed; production drift is not verified." "$SDIR/drift-check.sh"
  elif printf '%s\n' "$drift_output" | grep -Eq '未配置|跳过|无法|无基线|不可判定'; then
    add_finding "sync.unverified" "unverified" "The drift adapter reported incomplete coverage." "$SDIR/drift-check.sh"
  fi
else
  echo "  (未配置 $SDIR/drift-check.sh —— 拷模板 + 接 live-config.sh 后,可检出「配置被改没部署 / 线上镜像 git 里找不到」类漂移)"
  add_finding "sync.unverified" "unverified" "No production-drift adapter is configured." "$SDIR/drift-check.sh"
fi
echo ""

# 8) 最近 5 个 meta-repo commit
echo "── 最近提交 (meta) ──"
git log --oneline -5 2>/dev/null
echo ""
echo "▸ 开工四步: ① git pull(含子仓)  ② 读 NOW → 当期看板 → 契约 → 最近拍板  ③ 确认你域要动的不 stale  ④ 不可逆动作(部署/契约/migration)前重跑本脚本"
finalize_findings
blocked="$(awk -F '\t' '$3=="conflict" || $3=="error" { blocked=1 } END { print blocked+0 }' "$FINDINGS_SORTED")"
echo ""
echo "── 结构化检查摘要 ──"
if [ ! -s "$FINDINGS_SORTED" ]; then
  echo "  (无 findings;仅代表已覆盖的仓库事实)"
else
  while IFS=$'\t' read -r _rank code level message path; do
    printf '  [%s] %s%s — %s\n' "$level" "$code" "${path:+ @ $path}" "$message"
  done < "$FINDINGS_SORTED"
fi
[ "$STRICT" = 0 ] || [ "$blocked" = 0 ] || echo "⛔ strict 未过:存在 conflict / error finding"
echo "════════════════════════════════════════════"

if [ "$FORMAT" = "json" ]; then
  if ! render_json_report >&3; then
    echo "bus-check: failed to render JSON report" >&2
    exit 2
  fi
fi
if [ "$STRICT" = 1 ] && [ "$blocked" -eq 1 ]; then
  exit 1
fi
exit 0
