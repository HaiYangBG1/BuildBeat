# ADR 使用约定

ADR 只承载长期、难回退的技术决定；普通产品拍板、Gate 确认、短期可逆选择继续写在 `pm/decisions.md`。

满足任一条件时建议从 `ADR-0000-template.md` 复制一份新文件：

1. 改变核心运行时、框架、数据库或部署方式；
2. 改变跨服务或跨仓架构；
3. 改变关键数据模型或公共接口策略；
4. 形成长期、难以回退的技术约束；
5. 推翻或替代此前 ADR。

命名使用 `ADR-NNNN-kebab-case.md`，编号单调递增。Status 只允许 `Proposed / Accepted / Rejected / Superseded`。若为 Superseded，必须填写一个存在的仓库根相对路径，例如 `pm/adr/ADR-0002-new-choice.md`；新 ADR 解释替代原因，旧 ADR 保留不删除。

ADR 收敛后仍在 `pm/decisions.md` 追加一行索引，指向 ADR 和实际回写落点；ADR 不管理团队成员、审批人或组织权限。
