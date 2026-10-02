# BuildBeat 方法论 · 模板索引与实战教训（原 §9–§10）

> 从 [`SKILL.md`](../../../SKILL.md) 移出的正文，原文与原节号不变，只调整了相对链接；入口、驾驶手册与红线摘要仍在 `SKILL.md`。

## 9. 模板索引(templates/,直接拷贝后改占位符)

| 模板 | 用途 |
|---|---|
| [templates/v2/AGENTS.md](../../../templates/v2/AGENTS.md) / [templates/v2/指挥台.md](../../../templates/v2/指挥台.md) | **项目装载入口**:一页流程 + 视角路由 + 十一条规则(含可见命名进决策卡)+ 红线;指挥台是"用户一句话 → 会话调什么"的操作卡 |
| [templates/v2/CLAUDE.md](../../../templates/v2/CLAUDE.md) / [templates/v2/BUILDBEAT.md](../../../templates/v2/BUILDBEAT.md) | 一行指针与版本标记(运行时版本、装载方式、升级 = 升级 CLI、回灌通道) |
| [templates/v2/run-config.example.yaml](../../../templates/v2/run-config.example.yaml) | 可原样解析的 run 配置样板(含 fixer、reviewTriage、budgets、cache、envelope、redact);机器验证见 `tests/v2-templates-firstrun.test.js` |
| [templates/v2/envelope/worker.sh](../../../templates/v2/envelope/worker.sh) + [prompts/](../../../templates/v2/envelope/prompts/builder.md) | worker 包装(工具缺失 exit 75、喂 prompt、写入步机械 commit、只读步落信封)与 builder / reviewer / fixer 三份 prompt;拷到仓级 `delivery/envelope/` |
| [templates/pm/decisions.md](../../../templates/pm/decisions.md) | 平台级决策包台账(全工作区唯一决策单点;Run 级批准由内核落 `decisions.jsonl`) |
| [templates/pm/adr/README.md](../../../templates/pm/adr/README.md) / [ADR 模板](../../../templates/pm/adr/ADR-0000-template.md) | 可选 ADR 判据、四态 Status 与替代链;默认不生成 |
| [templates/contracts/PROTOCOL.md](../../../templates/contracts/PROTOCOL.md) | 跨边界契约唯一入口骨架(多仓项目) |
| [templates/ARCHITECTURE.md](../../../templates/ARCHITECTURE.md) | 全栈总图骨架(架构/基础设施/凭据位置/子项目索引;多仓项目) |
| [templates/standards/STACK.md](../../../templates/standards/STACK.md) / [CODE](../../../templates/standards/CODE.md) / [REVIEW](../../../templates/standards/REVIEW.md) / [DESIGN](../../../templates/standards/DESIGN.md) | 可选 project-owned 规范(Policy 输入工件);缺失跳过,Draft 显式待确认,DESIGN 仅 UI 项目 |
| [templates/gitignore.template](../../../templates/gitignore.template) | 工作区 .gitignore 模板(排除子仓、*.env、`.buildbeat/runtime/`、`.buildbeat/worktrees/`;拷入后改名) |

> 运行时命令面(`accept / start / resume / status / inbox / overview / approve / reject / findings / doctor / preflight / gc / metrics / observe / watch`)见 [docs/v2/guide/README.md](../guide/README.md);Skill-only 手工路径 / 运行时 / Claude 插件各自的可用面见 [docs/CAPABILITY-MATRIX.md](../../CAPABILITY-MATRIX.md)。

## 10. 反模式与实战教训

血泪清单(每条都真实发生过)见 [lessons.md](../../../lessons.md)——SSOT 腐烂、读过期 race、静态稿拍板返工螺旋、视角过细收敛史、"当前版本"声明漂移、走查漏独立弹窗、构建产物混入他人 WIP、平台侧配置漂移、UI 元注释复发、核查门吞掉交付、追踪项当任务边界、等待找不到人、预算是刹车不是墙、基础设施故障当候选失败、台账说的和人看到的不是一回事等。**搭完骨架后建议通读一遍,大部分零件就是为这些坑而生。**
