# 安全与权限边界

权威：[`RFC-0001 §保护动作`](../RFC-0001-product-definition.md)、[`V2-PLAN.md`](../../V2-PLAN.md) §9 不变量。设计哲学：**保护动作 = 能力移除**——不是"请 Agent 别做"，而是让它做不到。

## Runner 侧的物理边界（LOCAL_ENFORCED，均有测试）

| 边界 | 手段 |
|---|---|
| push 封禁 | worktree 级 `remote.pushurl=protected://push-blocked-by-buildbeat`——Worker 在工作区内 `git push` 无处可推（真实 remote 上实测） |
| 写范围 | `allowedPaths` 越界写入 → 不固定 candidate、`workspace.scope` BLOCK 落账、Run 停 |
| Reviewer 只读 | 步级前后快照比对，任何写入按失败落账（不变量 9） |
| 凭据隔离 | Worker env 白名单默认仅 `PATH HOME LANG LC_ALL TMPDIR TERM USER SHELL`；宿主云凭据/token 到不了子进程（`inheritEnv` 显式打开会被 doctor 降级标注） |
| 单活动 Run | 仓库级锁，一仓同时只有一个活动 Run |
| 控制文件 | workflow/policy/run 配置在主检出，不在 Worker 的 worktree 写范围内 |

merge、push、部署、`sys_client` 类生产变更**永远在 Runner 能力之外**，由人执行；Runner 至多把"merge-ready"放进 inbox。

## 无人值守的前置条件（MVP 起强制的立场）

prompt injection 是一等攻击面：无人值守 Worker 会消费仓库内任意文件。unattended run 必须同时满足：工具白名单、出网限制、**无生产凭据**；任一不满足→降级 attended（人在环）。observe 的 diagnose 命令同理只读、同 env 白名单纪律。

## SERVER_ENFORCED 是诚实声明

分支保护、CI 必须、部署审批属于服务端强制；Policy 里标 `SERVER_ENFORCED` 表示"这道门在服务端"，Runner 落账但不冒充能本地保证。本地挡不住的永远不要标 LOCAL。

## 凭据红线（运维侧）

发布/部署用的凭据只在运行时读取（如 macOS Keychain），不落文件、不落日志、不进 Git；`doctor` 检查 adapter 的 env 姿态。违反红线的配置不应通过评审。
