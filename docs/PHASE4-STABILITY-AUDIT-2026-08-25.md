# Phase 4 / WP4.3 稳定性硬门槛刷新（2026-08-25）

> 审计对象：以本地提交 `1887cf2` 为已保全输入，叠加 scoped `1.20.0` 迁移候选、真实版本增量 upgrade、多仓刷新与根内 legacy link 兼容修复。
> 证据等级：本地源码/文档静态闭合 + disposable 沙箱 + Wave 1/2 真实 Git 项目 + 真实多仓只读投影。npm/GitHub 身份已做发布前只读预检；本页刷新时尚未执行 push、tag、Release、publish、部署或远端改名。
> 结论：**12 条已达到源码/真实试点候选口径；外部分发仍未完成，因此不得把本结论写成“已发布”或“scoped npm artifact 已可用”。**

## 逐条审计

| # | 状态 | `ROADMAP.md` §15 门槛 | 当前证据 | 不可外推 / 待办 |
|---:|:---:|---|---|---|
| 1 | `[x]` | 执行同步不变量有明确文档和自动检查 | [`CHECKS.md`](CHECKS.md) INV-1–INV-8；`test-scripts.sh` human/JSON 同源回归 | 只证明已登记不变量和本地观测范围 |
| 2 | `[x]` | 完成状态不能在无 evidence 时静默通过 strict | `board-done-no-evidence`、`evidence-valid`、`evidence-outside-archive` fixtures | symlink/权限未读证据诚实保留 unverified，不误报缺失 |
| 3 | `[x]` | Gate `N/A` 必须有理由 | `gate-na-no-reason` strict 冲突；`gate-na-ui-inconsistent` 显式 warning | 机器只核语法/正向 UI 矛盾，不代替人工判定理由正确 |
| 4 | `[x]` | standards 缺失不报错，存在时能检查可观测部分 | missing/partial/valid/Draft/invalid + STACK 三态 fixtures | 不观测自然语言宣言的语义正确性 |
| 5 | `[x]` | `STACK.md` 冲突不会触发自动改栈或改代码 | `bus-check` 只读 finding；`stack-conflict` 对项目文件零写 | 修复责任仍在项目 Builder + 人工决策/ADR |
| 6 | `[x]` | CLI 所有写入可预览，冲突时 fail-closed | Node `init/adopt/upgrade` 用例覆盖 dry-run、碰撞、dirty Git、hash、force、major、回滚与 manifest-last；真实 upgrade 默认 dry-run 对四个已改文件零写阻断 | scoped registry artifact 尚未回读；legacy npm v0 仍只读 |
| 7 | `[x]` | 不安装 CLI 时 Skill 保留完整能力 | `skill-only.test.sh` 在屏蔽 Node 后运行项目本地 strict 检查；无 manifest/optional 仍合法 | AI 工具如何自动加载 Skill 需按对应工具另验 |
| 8 | `[x]` | CLI 创建或升级的项目可由 Skill-only 环境继续维护 | 真实 CLI `init` 后屏蔽 Node 仍 strict 0；真实 `v1.16 → v1.20` upgrade 后项目仍使用同一文件协议，项目自有事实回灌后 strict 0 | strict 0 的项目仍有 `coverage.complete=false`，不得外推线上状态 |
| 9 | `[x]` | 项目本地脚本仍可独立运行 | Skill-only/CLI-created 两个一次性项目均在 Node 失效时运行 `scripts/bus-check.sh --strict` | live adapters/项目真实测试未配置时仍必须报告降级 |
| 10 | `[x]` | 不引入账号、遥测、远程数据库、团队模型或 `emit` | package 零 runtime dependencies；CLI 生命周期仅本地 Git/文件系统；产品非目标中英契约 + 关键文件检查 | npm 下载本身是包管理器行为，不是项目遥测/远程运行时 |
| 11 | `[x]` | 真实项目试点通过，而不仅是模板测试 | [`PHASE4-V1.20-PILOT-2026-08-25.md`](PHASE4-V1.20-PILOT-2026-08-25.md)：真实 schema 2 `v1.16 → v1.20` upgrade、project-owned 零 diff、doctor 0/0、项目 strict 0；另对真实四子仓协调层完成只读刷新 | 多仓刷新正确暴露业务仓 `lessons.md` 断链和 map/适配器未验证，不把目标业务仓冒充全绿 |
| 12 | `[x]` | README、SKILL、AGENTS、示例和 CLI 帮助不存在相互矛盾的定位 | 中英 README 终校；[`CAPABILITY-MATRIX.md`](CAPABILITY-MATRIX.md) 三面区分；`check_docs.py` 锁定定位/能力/发布边界 | 远端 npm README 是不可变已发布产物，须在真实发布后独立 registry 回读 |

## 外部分发待办

1. 将候选提交保全，完成 GitHub 仓库改名、remote 更新、push 与默认分支 CI 回读，并确认规则集和 `npm-publish` environment 未因改名丢失。
2. 为 `@haiyangbg/buildbeat` 建立最小 bootstrap package，再绑定 GitHub Actions Trusted Publisher；bootstrap 不占用 `latest`。
3. 由受保护 `v1.20.0` tag 驱动 publish，逐项回读 registry version、integrity、provenance attestation、signature、隔离安装/doctor 和 npm README。
4. 创建 GitHub Release；确认新旧仓库 URL 行为后，对 legacy `solobaton` 加迁移 deprecation，不 unpublish。

## WP4.3 当前口径

WP4.2 已关闭；真实升级和多仓刷新又关闭了第 11 条源码/试点证据缺口。用户已批准 scoped package + 新仓库名迁移，但只有完成上节每项远端回读后，才能关闭 WP4.3 并宣称 `@haiyangbg/buildbeat@1.20.0` 已发布。
