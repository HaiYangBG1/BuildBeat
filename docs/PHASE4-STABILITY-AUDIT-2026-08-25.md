# Phase 4 / WP4.2 稳定性硬门槛审计（2026-08-25）

> 审计对象：以本地提交 `5179e99` 为已保全输入，叠加 WP4.2 能力矩阵、双语终校与互操作回归候选。
> 证据等级：本地源码/文档静态闭合 + disposable 沙箱 + 已归档的 Wave 1 真实目录证据。本次未重跑真实项目、未查询 npm/GitHub 可变远端状态，也未执行 push、tag、Release、publish、部署或远端改名。
> 结论：**12 条中 11 条达到当前源码候选口径；第 11 条仍开放，因此不得宣称“新版协议已稳定发布”或“已规划的 CLI 能力已在 npm 可用”。**

## 逐条审计

| # | 状态 | `ROADMAP.md` §15 门槛 | 当前证据 | 不可外推 / 待办 |
|---:|:---:|---|---|---|
| 1 | `[x]` | 执行同步不变量有明确文档和自动检查 | [`CHECKS.md`](CHECKS.md) INV-1–INV-8；`test-scripts.sh` human/JSON 同源回归 | 只证明已登记不变量和本地观测范围 |
| 2 | `[x]` | 完成状态不能在无 evidence 时静默通过 strict | `board-done-no-evidence`、`evidence-valid`、`evidence-outside-archive` fixtures | symlink/权限未读证据诚实保留 unverified，不误报缺失 |
| 3 | `[x]` | Gate `N/A` 必须有理由 | `gate-na-no-reason` strict 冲突；`gate-na-ui-inconsistent` 显式 warning | 机器只核语法/正向 UI 矛盾，不代替人工判定理由正确 |
| 4 | `[x]` | standards 缺失不报错，存在时能检查可观测部分 | missing/partial/valid/Draft/invalid + STACK 三态 fixtures | 不观测自然语言宣言的语义正确性 |
| 5 | `[x]` | `STACK.md` 冲突不会触发自动改栈或改代码 | `bus-check` 只读 finding；`stack-conflict` 对项目文件零写 | 修复责任仍在项目 Builder + 人工决策/ADR |
| 6 | `[x]` | CLI 所有写入可预览，冲突时 fail-closed | Node `init/adopt/upgrade` 用例覆盖 dry-run、碰撞、dirty Git、hash、force、major、回滚与 manifest-last | 只对当前未发布源码候选成立；已发布 npm v0 仍只读 |
| 7 | `[x]` | 不安装 CLI 时 Skill 保留完整能力 | `skill-only.test.sh` 在屏蔽 Node 后运行项目本地 strict 检查；无 manifest/optional 仍合法 | AI 工具如何自动加载 Skill 需按对应工具另验 |
| 8 | `[x]` | CLI 创建或升级的项目可由 Skill-only 环境继续维护 | 新互操作回归：真实 CLI `init` 后由 Skill 渲染，屏蔽 Node 仍 strict 0；WP2.8 CLI init/adopt + Skill 语义渲染试点 | 真实版本增量 `upgrade` 后的独立项目互操作仍属第 11 条待办 |
| 9 | `[x]` | 项目本地脚本仍可独立运行 | Skill-only/CLI-created 两个一次性项目均在 Node 失效时运行 `scripts/bus-check.sh --strict` | live adapters/项目真实测试未配置时仍必须报告降级 |
| 10 | `[x]` | 不引入账号、遥测、远程数据库、团队模型或 `emit` | package 零 runtime dependencies；CLI 生命周期仅本地 Git/文件系统；产品非目标中英契约 + 关键文件检查 | npm 下载本身是包管理器行为，不是项目遥测/远程运行时 |
| 11 | `[ ]` | 真实项目试点通过，而不仅是模板测试 | WP2.8 已有 BuildBeat canonical Wave 1 真实目录 init/adopt/Skill-only 证据 | **未闭合**：当前 bundle 仍 v1.16，无真实版本增量 upgrade 试点；WP3.3/WP3.4 多仓/权限异构真实项目未刷新 |
| 12 | `[x]` | README、SKILL、AGENTS、示例和 CLI 帮助不存在相互矛盾的定位 | 中英 README 终校；[`CAPABILITY-MATRIX.md`](CAPABILITY-MATRIX.md) 三面区分；`check_docs.py` 锁定定位/能力/发布边界 | 远端 npm README 是不可变已发布产物，须在真实发布后独立 registry 回读 |

## 阻塞发布的待办

1. 在 scaffold version/template 有真实增量后，选一个经授权的 schema 2 项目运行“旧 bundle → 新 bundle”升级试点，保留 dry-run/apply、Git 前后、manifest/hash、doctor、Skill-only 维护与 `bus-check` 证据。
2. 在经授权的真实多仓/权限异构环境刷新 WP3.3/WP3.4，明示观测范围与 `coverage.complete`，不把未验证范围写成通过。
3. 完成 WP4.3 外部分发标识决策、版本/发布序列拍板，然后才能进入 tag、Trusted Publishing、registry/provenance/签名/隔离安装回读和 GitHub Release Gate。

## WP4.2 关闭口径

WP4.2 可以在“能力矩阵、双语定位、互操作回归、硬门槛现状归档”口径下关闭；关闭 WP4.2 **不关闭第 11 条发布门槛，不批准 WP4.3 决策，也不授权任何外部动作**。
