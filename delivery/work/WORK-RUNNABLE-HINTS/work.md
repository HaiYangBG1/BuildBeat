# 提示里给的命令都能直接执行

## 目标

2026-10-07 按快速开始从零接入一个新项目、用真实 Codex 写和审跑完一项工作后实测：候选合并后，`status` 提示"上线后运行 `buildbeat release --config …`，再 `decide --action close`"。这项工作的 run 配置没有 `release:` 段，照做必然报错 `release needs a release: section in the run config`，工作也永远关不了窗；本仓已合并的工作同样如此。同一次实测还在三处提示和样板里遇到 3.x 的命令名。

本工作让提示和快速开始里给出的每条命令、每个路径在当前配置下都能照做。

## 范围

包含：

1. **已合并、没有回读配置的工作**：Work 目录下所有 run 配置都没有 `release:` 段时，`status` 的下一步改为说明"已合并；未配置上线回读，没有剩余必做步骤"，并说明如需记录回读并关窗，先在 run 配置加 `release:` 段再运行 `buildbeat release`。有 `release:` 段时照旧，命令里的 `--config` 指向带该段的那份配置。读不了配置时照旧给占位。
2. `check` 输出中通知一行的 "until someone runs inbox" 改为 `status`。
3. `status` 遇到待人决定、却取不到具体回复命令时的兜底 `buildbeat inbox --repo …` 改为 `buildbeat status --repo … --work <ID>`。
4. run 配置样板顶部注释中的 `buildbeat doctor`、`buildbeat start --config … --attempt new`、`--attempt new` 改为 `buildbeat check`、`buildbeat run`、`--new`；同步其逐字副本：`SKILL.md` 配置样板、快速开始中英两版、示例项目的 run 配置。
5. 快速开始中英两版写明 npm 全局安装后模板所在位置（`$(npm root -g)/@haiyangbg/buildbeat/templates/v2/`），并说明 `gitignore.template` 在上一级 `templates/`。
6. **WORK-CROSS-REPO-STATUS 的两项遗留**：
   - 单仓 `status` 中，本仓有工作目录、没有工作说明、但有运行记录的工作，恢复 4.0.0 的 `NO_INTENT` 显示与提示（本仓 `WORK-V2-M1-ACCEPT` 被改成了 `STOPPED_CANCELLED`）；本仓没有工作目录、只有运行台账的工作仍显示运行状态。
   - `--all-repos` 新增的输出行改为英文（所有者 2026-10-07 决定），措辞见下表。

### 对外文字（所有者已决定改英文，具体措辞随本说明接受）

| 原文 | 改为 |
|---|---|
| `待人决定 · <仓>` | `pending decisions · <repo>` |
| `仓库：<仓>` | `repo <repo>:` |
| `<仓>：已了结 N 项（CLOSED a / CANCELLED b / 已合并无收尾步骤 c）` | `<repo>: settled N (closed a · cancelled b · merged, no release step c)` |
| 工作行下的 `所在仓：<仓>` | `repo: <repo>` |
| 工作行下的 `运行目标：<仓>` | `runs in: <repo>` |
| 已合并且无 `release:` 段时的下一步 | `merged; no release readback configured, nothing left to do (add a release: section to the run config to record a readback and close the window)` |

不包含：关窗规则（仍只在最近一次回读通过时关窗）、3.x 旧 Run 的回复命令（它们只能回到 3.3.1 运行时处理，保持原样）、旧命令别名本身、`release` 命令的行为。

## 验收

- `verify.sh` 全过：Node 回归、文档检查、Bash 信封、Claude 插件、安装后首跑、本 Work 范围内 `git diff --check`。
- 回归测试覆盖：已合并且无 `release:` 段时提示不含 `buildbeat release --config` 并说明没有剩余必做步骤；有 `release:` 段时提示照旧且指向那份配置；`check` 输出不再出现 `inbox`；样板及其副本不再出现 `doctor`、`start --attempt new`、`--attempt new`；快速开始中英两版给出的模板路径在 npm 安装包里真实存在；单仓 `status` 对"有工作目录、无工作说明、有运行"的工作输出与 4.0.0 一致；`--all-repos` 文本输出不含中文。
- 独立只读审查无未裁决的 P0/P1。

## 实施计划

1. 在 overview 判断 Work 的 run 配置是否带 `release:` 段（用现有 YAML 子集解析器），改合并后提示与兜底提示。
2. 改 `check` 的通知说明。
3. 改样板注释并同步副本；示例项目快照的自洽测试随之通过。
4. 恢复单仓 `NO_INTENT` 判断；`--all-repos` 文本改英文，同步 `tests/v2-cross-repo-status.test.js` 的断言。
5. 补回归测试与 CHANGELOG `Unreleased`。

## 止损

范围变化需要新的决定。审查轮数上限 6 轮（run-config `budgets.reviewRoundsPerWork`）。
