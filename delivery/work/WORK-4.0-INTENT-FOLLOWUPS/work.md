# 4.0 发布前的四项意图决定

## 目标

落实所有者 2026-10-04 对 PR #70 独立审查中四个意图问题的决定（来源见 [WORK-PR70-REVIEW 审查结论](../WORK-PR70-REVIEW/review-summary.md)），在 4.0 发布前补齐：

1. **UI 真渲染证据**：可选开关打开后，合并检查要求当前候选有截图证据，批准卡列出截图。
2. **上线收尾**：合并后在同一 Work 下运行项目自己的回读命令，输出记为证据，人再关窗。observe 不恢复。
3. **治理模板**：保持移出，把移出理由改成真实理由。
4. **无运行时参与**：一页兼容规则，Skill 加一行指向。

## 待所有者确认的对外名字（接受本说明即确认）

| 项 | 提议 | 备选 |
|---|---|---|
| 截图开关 | run-config `requireScreenshot: true` | `checks:` 段下 `screenshot: required` |
| 截图交付位置 | verify 运行时环境变量 `BUILDBEAT_SCREENSHOT_DIR` 指向的空目录，放 png / jpg / webp | 通用的 `BUILDBEAT_EVIDENCE_DIR` |
| 回读命令配置 | run-config `release:` 段（command / args / timeoutMs / env，形状同 worker） | `workers.readback` |
| 运行回读 | `buildbeat release --config <config> [--note <text>]` | `buildbeat run --config <config> --readback` |
| 关窗 | `buildbeat decide --repo . --work <ID> --action close --result <text> --by <name>` | — |
| 回读记录 | `delivery/work/<ID>/releases.jsonl`，每次一行；完整日志留在 `.buildbeat/runtime/` | — |
| 兼容规则文档 | `docs/v2/guide/12-without-runtime.md` 与 `.en.md` | — |

## 范围

包含：运行时（配置校验、冻结条件、verify 证据、合并检查、新命令、status / 待批 / 通知输出）、Skill、现行中英文档、模板与样例中受影响的部分、CHANGELOG、对应回归测试与包清单。

不包含：恢复 observe、release-readback 车道或策略语言；恢复治理模板；发布 npm、调整插件市场分发、合并到 main（各自单独决定）。

## 行为要点

### 1. 截图证据

- 开关进入 Run 创建时冻结的检查条件；之后改配置不能关掉它（沿用"恢复时检查条件不得改变"）。
- verify 运行时内核建一个空目录并设上述环境变量；目录在工作树外，不弄脏候选。verify 成功后，目录中的每张图片记为一条 `screenshot` 证据：文件摘要、绑定当前候选，副本存运行时目录。
- 开关打开而 verify 成功却没有截图：本次 verify 记为失败，原因写明"没有截图证据"，按失败路由。复用缓存的 verify 时一并沿用来源的截图证据。
- 合并检查：开关打开时，当前候选必须有截图证据。reviewer 的输入带截图路径；合并决定处的状态卡、待批列表和通知列出截图路径与摘要。

### 2. 上线收尾

- 只在 Work 有已成功的 Run，且其候选已包含在 `--ref`（默认主检出当前 HEAD）时运行；否则拒绝并提示先合并。
- 在主检出执行配置的回读命令，环境变量白名单与脱敏规则同 worker。记录结果、退出码、所在提交、输出摘要与脱敏后的末尾若干行。可多次运行，`--note` 标注阶段（如"发布前""发布后"）。
- 关窗要求最近一次回读通过，写入 `close-work` 决定（带结果、回读摘要与提交）。status 在合并后显示最近一次回读，关窗后显示 CLOSED。
- 记录在 Git 面，不新增运行时事件类型，不改动 observe 旧记录。

### 3. 理由更正

MIGRATION、CHANGELOG、CAPABILITY-MATRIX 中治理模板的移出理由改为：4.0 聚焦交付闭环，项目级治理规范不在范围内，原文保留在 `docs/history/retired-templates/`。不再写"不再默认安装"（它们本就不默认生成）。

### 4. 无运行时兼容规则

一页说明：没有运行时时可以读哪些文件了解状态，可以写 `work.md` 并按指定格式追加 `decisions.jsonl` 行；不得代批 Run、不得声称自动闭环、验证或审查证据；之后由装有运行时的人或会话接手时如何对齐。Skill 加一行指向，guide 索引与现行文档检查同步。

## 验收

- `verify.sh` 全过：Node 回归、文档检查、Bash 信封、Claude 插件、安装后首跑、PR 范围 `git diff --check`、3.3.1 四场景对照。
- 回归覆盖：截图开关打开时无截图被拒、有截图通过、缓存复用沿用截图、改配置后恢复被拒、批准卡显示截图；`release` 未合并时拒绝、合并后写入记录、回读失败不能关窗、关窗后 status 显示；兼容规则文档存在、中英一致、Skill 指向有效。
- 三路独立只读审查（运行时与命令、文档与界面、测试与打包）无未裁决的 P0/P1。

## 实施方式

- 由主检出中已合入 main 的 4.0 源码运行时驱动（`node bin/buildbeat.js`），借此在发布前实际走一遍 4.0 的 work.md / run / decide。4.0 驱动若出现阻断性故障，改用已安装的 3.3.1 继续，并在记录中说明。
- 不配 builder / fixer：驾驶会话亲自写代码，以 `--adopt` 交接；verify 与 reviewer 保持独立。

## 止损

review 最多 6 轮，跨 Run 累计。范围或对外名字有变化需重新接受。合并、推送、发布另行决定。
