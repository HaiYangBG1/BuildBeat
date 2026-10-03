# PR #70 description snapshot

Snapshot of the GitHub PR description at head 6554f2d, saved so the read-only
reviewers (no network) can judge the stated intent and evidence.

Title: refactor!: 聚焦可恢复交付，精简产品范围与操作入口

## Failure mode and scope

### 这次要解决什么

BuildBeat 的主要价值是：**换会话能继续工作、AI 自动推进交付、交付结果有证据并保留人的决定权**。3.3.1 的功能面已经扩展到生产巡检、上线专用流程、UI 专属门、通用 Workflow/Policy 编写和整套治理模板；与此同时，工作说明、执行、进度和审批分散在多份工件与多个命令中，增加了配置、接续和维护成本。

对基线仓库的盘点显示，11 份运行配置全部使用标准交付流程，10 份启用了验证缓存，没有引用额外 Policy 文件。这个样本只代表本仓库，不能推断外部项目没有使用被移出的功能。它支持本次取舍：保留减少重复执行和人工调度的机制，把产品范围收回到可恢复、可验证的交付循环。

本 PR 是这次取舍的完整实现，版本标为 **`4.0.0-dev.0`（未发布候选）**。涉及破坏性变更，因此同步修改运行时、模板、示例、双语文档、协议修订说明和回归测试，而非仅隐藏菜单或改文案。

### 最终取舍

| 处理 | 范围 | 原因与结果 |
|---|---|---|
| 保留 | 工作上下文、Build/Verify/Review/Fix、候选与证据绑定、人工决定、恢复与止损 | 直接支撑三个核心承诺 |
| 保留 | worktree、范围限制、只读审查、缓存、增量审查、并行隔离、通知和安全清理 | 保持可信交付，并减少重复执行与互相干扰 |
| 移出 | observe 巡检、诊断和 Intent 队列，release-readback 及 release 预设 | 由项目的监控、CI 和发布脚本承接，默认交付终点收在合并决定 |
| 移出 | UI 专属步骤和策略、通用 Workflow/Policy 编写 | UI 验证进入项目验收命令；主产品改为固定交付图和内置校验 |
| 归档 | 默认治理脚手架、旧方法论，以及独立 Skill-only 产品路线 | 不再默认安装整套组织规范；文件仍可读，项目已有规范仍由项目维护 |
| 合并 | 工作工件与日常操作入口 | 新工作使用一份 `work.md`，旧核心命令通过兼容别名复用处理逻辑 |

新工作说明包含目标、范围、验收条件和实施计划；接受仍绑定内容摘要。运行时记录冻结的 `deliveryChecks`，恢复和批准按记录执行，不能通过省略配置降低条件。Worker 收到明确的工作说明引用与 digest；启动前检查所选代码基线的检出内容与接受内容一致。

| 原入口 | 当前主入口 |
|---|---|
| `start` / `resume` / `resume --adopt` | `run`；只有明确 `--new` 才另起一轮 |
| `overview` / `inbox` / `status` / `metrics` | `status`，可按 Work、Run 或 JSON 展开 |
| `approve` / `reject` / `findings adjudicate` | `decide`，仍指定准确的决定对象 |
| `doctor` / `preflight` | `check`；显式 `--step` 仍会执行真实命令 |
| `events` / `replay` | `history` / `history --verify` |

`accept`、`stop`、`gc` 保持显式；watch 是内部运行反馈机制。旧核心拼写仍可使用，兼容不等于保留两套实现。

### 实施与审查如何收敛

1. 先记录接受的范围，再移出非核心执行能力，合并入口，替换通用规则语言并补齐兼容拒绝路径。
2. 首轮独立只读审查发现 1 项 P1、2 项 P2：新模板提示词仍引用旧工件、未接受的 `work.md` 草稿被隐藏、按 Work 查看时混入其他工作的待批项。三项均修复，并补充只使用 `work.md` 的首跑及多 Work 回归。
3. 另行复现并修复：同一候选经过无改动修复后，旧审查结果仍会阻断已经驳回的问题。现在读取当前裁决；之后重新接受的问题仍会重新阻断。隐藏策略与非法预算也明确拒绝，不静默忽略。
4. 第二轮独立审查确认前述修复，发现 CRLF/LF 兼容问题。以真实 Git 的 `core.autocrlf` 与 `.gitattributes` 两种配置先复现失败，再改为比较 Git 检出过滤后的内容；实际范围变更仍会拒绝启动。
5. 第三轮独立只读审查返回空 findings。旧待批运行被标记为 SUPERSEDED，没有被自动批准；唯一当前候选仍等待人工合并决定。
6. 上传 PR 后又做了一轮代码审查，发现 9 项，修复 8 项（提交 `6554f2d`），并补 5 个回归用例；这 5 个用例在修复前的代码上全部失败：
   - `run` 按名字前缀判断 run 家族，仓库里有同前缀的另一家族（如 `RUN-A-B-01`）时，新工作首次 `run` 会报错卡住。现在只认 `<run>` 与 `<run>-NN` 且有运行记录的目录。
   - 写了 `workflow` 但没写 `riskPreset` 的旧配置被默认成 standard，额外要求工件已接受并提交在基线里。现在按 fast 运行（与 3.3.1 一样不设工件门槛），合并证据门槛仍生效。
   - 旧规划起点（intent/spec/plan）与要求接受的预设组合时，基线检查必然失败。现在在创建任何运行前明确报错，提示写好、接受并提交工件后改用 `entry: build`。
   - 已结束的旧 run 在配置迁移后会报 “workflow changed”。现在先报告终态并提示 `--new`。
   - 其余为 `status` 提示改用 `run` / `work.md`、去掉重复读取和不可达代码、复用 findings 读取函数。
   - 未处理：大面积格式化未回退（回退风险大于收益，若需要可单独拆提交）；`loadRiskPreset` 返回的 `policies` 仍被测试使用，保留。

## Evidence

三轮独立只读审查针对产品代码提交 `9bc9632e5c00bf3ebd060b0e049dee0fa8b04d75`（`73ffd48` 仅追加验收记录）。当前 PR head 为审查修复提交 `6554f2d`，下表本地验证均已在 `6554f2d` 上重新执行。GitHub CI 将对 PR head 重新检查；以下不预先宣称远端 CI 通过。

| 检查 | 结果 |
|---|---|
| Node 回归 | **274 通过，0 失败**（含 5 个审查修复回归） |
| 安装后首跑 | **17 项通过**，含 verify 失败 → fixer → 重验 → review |
| Bash 信封合同 | **18 项通过**，Bash 3.2 |
| Claude 插件 | **7 项通过**，含隔离环境实际安装与缓存验证 |
| 文档检查、diff 检查 | 通过（`6554f2d` 未改动 Shell 脚本） |
| 独立只读审查 | 3 轮，最终 findings 为空（针对 `9bc9632`） |
| 上传后代码审查 | 9 项，8 项已修复（`6554f2d`），1 项（格式化）保留 |
| 与 3.3.1 的四场景对照 | 在 `6554f2d` 上重跑：正常交付、修复、恢复、过期批准的结果及 worker/人工请求次数一致 |

| 本地打包指标 | 3.3.1 基线 | 当前候选 |
|---|---:|---:|
| 文件数 | 127 | 103 |
| 压缩字节 | 285,778 | 174,748 |
| 解压字节 | 794,414 | 519,277 |

解压体积减少 **34.6%**。这证明分发体积收缩；脚本对照证明所测路径未增加 worker 调用，**不证明真实 AI 模型交付速度提高，也不代表 Windows 实机或所有外部项目已验收**。

验收文档记录的是上传 PR 前（`9bc9632`）的本地快照，未随 `6554f2d` 更新：

- [实施与验证记录](https://github.com/HaiYangBG1/BuildBeat/blob/73ffd48/delivery/work/WORK-PRODUCT-SIMPLIFY/validation.md)
- [验证摘要与证据 digest](https://github.com/HaiYangBG1/BuildBeat/blob/73ffd48/delivery/work/WORK-PRODUCT-SIMPLIFY/verification-summary.json)
- [第一次审查](https://github.com/HaiYangBG1/BuildBeat/blob/73ffd48/delivery/work/WORK-PRODUCT-SIMPLIFY/review-1.json)、[第二次审查](https://github.com/HaiYangBG1/BuildBeat/blob/73ffd48/delivery/work/WORK-PRODUCT-SIMPLIFY/review-2.json)、[最终审查](https://github.com/HaiYangBG1/BuildBeat/blob/73ffd48/delivery/work/WORK-PRODUCT-SIMPLIFY/final-review.json)
- [四场景对照数据](https://github.com/HaiYangBG1/BuildBeat/blob/73ffd48/delivery/work/WORK-PRODUCT-SIMPLIFY/parity-results.json)

- [x] 执行了相关回归测试。
- [x] 执行了 `npm test`、`npm run check:docs` 和本地打包检查，并验证安装后的首跑。
- [x] 执行了 `git diff --check`。
- [x] 同步更新 CHANGELOG、受影响的协议说明、模板、示例和双语文档。
- [x] 新增提交已扫描凭据，并检查没有加入私有项目源码、个人数据或本机路径。
- [x] 本次仅提交 PR，未合并、发布 npm、部署或改写目标项目。

## Compatibility and rollback

这是主版本兼容性变化，不能直接覆盖仍在运行旧 Run 的安装。

- **既有记录保留**：候选提交、决定、审查裁决、终态记录和历史发布状态仍可读取；CLI 不自动删除或迁移目标项目文件。
- **旧活动 Run**：缺少冻结校验元数据，需用其原来的 3.3.1 运行时完成或取消；新版可读取或取消，但不代为恢复和批准。
- **旧官方交付配置**：可在新版启动新一轮，保留原工件要求、流程摘要和严重度门槛；controlled 不会静默降为 standard。未写 `riskPreset` 的旧配置按 fast 运行（不设工件门槛），合并证据门槛始终生效；旧规划起点（intent/spec/plan）与要求接受的预设组合会在启动前报错。
- **自定义/生产流程**：明确报错，先收尾旧运行，再由项目脚本、监控或 CI 承接。新项目省略 workflow/riskPreset/policies，使用 `work.md` 和内置交付校验。
- **安全回退**：使用隔离安装目录保留旧运行时；先停止新运行并保存候选和运行数据，再回退工具。不能用 3.3.1 驱动新的 4.x Run，因为旧版不执行新增冻结校验。
- 本 PR 不启用自动合并，不触发版本发布或安装升级。合并和后续发布需要分别决定。

完整操作边界见 [迁移说明](https://github.com/HaiYangBG1/BuildBeat/blob/73ffd48/docs/MIGRATION.md)。


