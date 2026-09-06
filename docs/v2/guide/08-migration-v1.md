# v1 → v2 迁移指南（手工 runbook）

按收尾修正三：装机量 N=1，**不做 importer 工具**，人工走完。各步括号里的耗时是作者一次迁移的估算，不是承诺。

先分清两件事：**升级 CLI** 与 **迁移项目状态**。`npm install --global @haiyangbg/buildbeat@latest` 只是前者——它把 `buildbeat-v2` 装到机器上，对项目文件零改动；v1 的 `buildbeat doctor / init / adopt / upgrade` 原样保留，schema 仍是 2，`buildbeat upgrade` 对 1.21 骨架报 up-to-date。后者才是本文：把"哪些工作在途"从 v1 看板搬进 `delivery/work/`，并冻结旧入口。三条铁律全程有效：

1. **不猜旧状态有效性**——v1 看板/状态文件里没有证据支撑的行，一律当"待人工确认"，不自动翻译成 v2 状态；
2. **单向迁移**——v1 只冻结不删除，历史归档可查；
3. **禁止双写**——切换日之后新工作只进 v2，任何"两边都记一下"都是回退。

## 前提（约 30 分钟）

- [ ] 安装稳定版（`npm install --global @haiyangbg/buildbeat@latest`，2.0.0 起 `latest` 即 v2；`buildbeat-v2` 无参运行能打印用法）；
- [ ] 读完 [快速开始](01-quickstart.md) 与 [Approval 指南](07-approval-guide.md)；
- [ ] 目标仓库工作树干净、基线已提交。

## 第 1 步：只读分析 v1（约 1 小时）

盘点现有 v1 资产，只读不改：

- 看板/状态文件（`pm/status/*.md` 或等价物）：列出**声称在途**的工作项；
- 提案与决策台账（`pm/changes/`、`pm/decisions.md`）：找出已批准未完成的事项；
- 契约（`contracts/*.md`）与探测器（`drift-check.sh` / `live-status.sh`）：记录现状与调用方式。

产出一张三栏清单：`确认在途 / 疑似过期 / 已完成未归档`。判断依据只认证据（提交、部署记录、生产事实），不认状态文件自述。

## 第 2 步：生成 v2 Work 草稿（约 1 小时）

只为"确认在途"的事项建 v2 工作项：

```bash
mkdir -p delivery/work/WORK-<名字>
# intent.md：这件事为什么存在（从 v1 提案摘录+核对）
# plan.md：接下来真实要做的步骤（不是 v1 计划的搬运——过期部分当场砍掉）
```

"疑似过期"的行**不迁移**，在清单上标注理由留档；"已完成未归档"的补归档到 v1 历史区。

## 第 3 步：人工确认当前活动 Work（约 30 分钟）

项目所有者逐项过草稿清单，拍板哪些 Work 开（accept intent/plan 即 digest 绑定确认）。没被拍板的草稿删掉或留在未接受状态——**未接受的草稿不产生任何义务**。

## 第 4 步：冻结旧看板（约 15 分钟）

在 v1 看板/状态文件顶部加冻结声明（日期 + "新工作见 delivery/，本文件停止更新"），提交。不删除、不再写入。

## 第 5 步：探测器重挂到 observe（约 30 分钟，可选先行）

把 drift-check/live-status 挂为 observe Provider（[Evidence 指南 §observe](06-evidence-guide.md)）：

```bash
cp <buildbeat>/src/v2/presets/observe.yaml .buildbeat/observe.yaml   # 改 command/subject
buildbeat-v2 observe run --config .buildbeat/observe.yaml            # 跑一个周期验证
```

v1 脚本本体不用改——它们的权威边界（各查什么、不证什么）原样保留。

## 第 6 步：真实 Run 验收（约 1 小时）

选一个已确认的 Work，用 v2 跑完一个真实 Run 到 `WAITING_HUMAN` 并完成决定。**这个 Run 成功之前不算切换完成**——期间发现的问题修完再宣布切换。

人批习惯迁移：v1 四 Gate 用户可先用 `riskPreset: legacy-four-gates`（四 Gate 完整形态），跑顺后再降到 `standard`。

## 完成定义

- 冻结声明已提交；所有新工作走 `delivery/` + v2 Runner；
- 至少一个真实 Run 走完 Build→Verify→Review→人批闭环；
- 三栏清单与拍板结果留档（就是迁移的证据）。

迁移前后可核对的目录：迁移前 `pm/NOW.md`、`pm/status/*`、`pm/changes/*` 可写；迁移后它们只读并带冻结声明，`delivery/work/<ID>/` 每个在途事项一个目录，`buildbeat-v2 overview --repo .` 能列出全部活动 Work 且没有重复。旧文件不删，任何时候可读；不要为旧 Run 伪造 run-record 或 manifest。

回退：v1 全部原样在 Git 里，去掉冻结声明即可回去——但双写永远禁止，回去就是整个回去。已经跑出的 v2 Run 台账保留在 `delivery/work/*/runs/`，回退不需要删它。
