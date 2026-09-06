# 安全与权限边界

权威：[`RFC-0001 §保护动作`](../RFC-0001-product-definition.md)、[`V2-PLAN.md`](../../V2-PLAN.md) §9 不变量。设计哲学：**保护动作 = 能力移除**——不是"请 Agent 别做"，而是让它做不到。

## Runner 侧的本地边界（LOCAL_ENFORCED，均有测试）

下表每行分两栏：**内核实际做到的**，与**不能由此推出的**。前者有回归测试；后者要靠宿主沙箱 / 容器 / 服务端，Runner 不冒充。

| 边界 | 内核实际做到的（检测或移除） | 不能由此推出 |
|---|---|---|
| push 封禁 | worktree 级 `remote.pushurl=protected://push-blocked-by-buildbeat`——Worker 在工作区内对配置的 remote `git push` 无处可推（真实 remote 上实测） | Worker 不能 `git remote add` 另一个远端、不能发起任何网络请求 |
| 写范围 | `allowedPaths` 越界写入 → 不固定 candidate、`workspace.scope` BLOCK 落账、Run 停——越界改动**不可能**成为合格候选 | Worker 进程无法触碰 worktree 之外的宿主目录 |
| Reviewer 只读 | 步级前后快照比对，任何工作树写入按失败落账（不变量 9）——这是**事后检测并阻断结果**，不是操作系统级禁写 | 写入在发生那一刻就被拦下 |
| 凭据隔离 | Worker env 默认白名单仅 `PATH HOME LANG LC_ALL TMPDIR TERM USER SHELL`；宿主 shell 里的云凭据 / token **环境变量**不进子进程；`inheritEnv: true` 显式打开会被 doctor 标为 ADVISORY；`env:` 只注入你点名的变量（CLI 加载路径 2.0.1 起真正透传，2.0.0 及更早 doctor 与 start 姿态不一致，见 [Adapter 指南](04-adapter-guide.md)） | Worker 读不到 `$HOME` 下的凭据文件、keychain、ssh key 等宿主资源（`HOME` 在白名单里） |
| 单活动 Run | 仓库级锁，一仓同时只有一个活动 Run | 多仓 / 多机并发有协调 |
| 控制文件 | workflow / policy / run 配置在主检出，不在 Worker 的 worktree 写范围内 | Worker 无法通过其他途径读到它们 |
| 内核无外部动作 | merge、push、部署、发布在 Runner **没有调用路径**（不变量 20，doctor 打印）；Runner 至多把"候选具备合并条件"放进 inbox | 你配置的任意外部 Worker 命令在全部宿主环境下都做不了这些动作 |

一句话：**内核保证的是"越界的结果进不了台账、成不了候选、盖不了章"**；"Worker 一开始就做不到"要靠宿主给它的沙箱（工具白名单、出网限制、无生产凭据）。

## 无人值守的前置条件（MVP 起强制的立场）

prompt injection 是一等攻击面：无人值守 Worker 会消费仓库内任意文件。unattended run 必须同时满足三层，缺一层就降级 attended（人在环）：

| 层 | 谁保证 | 内容 |
|---|---|---|
| 内核 | Runner（本表上节） | push 封禁、写范围、只读 reviewer、env 白名单、无外部动作调用路径 |
| 宿主 | 你的 worker 沙箱 / 容器 / 工具本身的权限模式（如 `codex exec -s read-only`） | 工具白名单、出网限制、**无生产凭据**——内核不检查也检查不了这层，doctor 只报告 env 姿态 |
| 服务端 | 代码托管 / CI / 部署平台 | 分支保护、必需 CI、部署审批（下节） |

observe 的 diagnose 命令同理只读、同 env 白名单纪律。

## SERVER_ENFORCED 是诚实声明

分支保护、CI 必须、部署审批属于服务端强制；Policy 里标 `SERVER_ENFORCED` 表示"这道门在服务端"，Runner 落账但不冒充能本地保证。本地挡不住的永远不要标 LOCAL。

## 凭据红线（运维侧）

发布/部署用的凭据只在运行时读取（如 macOS Keychain），不落文件、不落日志、不进 Git；`doctor` 检查 adapter 的 env 姿态。违反红线的配置不应通过评审。
