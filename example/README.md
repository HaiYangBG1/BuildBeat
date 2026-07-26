# example/ —— 教学沙盘:虚构项目「简账」跑完一期的快照

> 这里的每个文件,都是 `templates/` 对应模板**填好占位符之后的样子**。
> 🔴 项目、数据、人物、决策全部虚构(已脱敏);commit hash 均为示意值——真项目里 hash 必须真实可查(`git cat-file -t <hash>`,见 lessons.md 第 11 条)。

## 沙盘设定

- **项目**:「简账」—— 网页记账应用(就是主 README §2 举例的那个)
- **仓**:`jz-web`(前端 React)+ `jz-api`(后端 Node + SQLite),各自独立 git
- **域**:产品 / 全栈 / 测试(默认三域);**轨道**:标准轨;**部署**:示例 PaaS(沙盘不接真平台)
- **进度**:一期(记账主流程 + 月度报表)已跑完 Gate1→Gate4 上线,尚未换期

## 怎么读(建议顺序)

1. [pm/NOW.md](pm/NOW.md) —— 任何会话开工第一眼:当前期是什么、去看哪些文件
2. [pm/一期-看板.md](pm/一期-看板.md) —— 阶段门怎么勾、分工与挂账长什么样
3. [pm/decisions.md](pm/decisions.md) —— 拍板台账:一期六锤下来的样子(注意每行都有回写落点)
4. [pm/status/](pm/status/) —— 三个域各写各的状态:带 hash、带证据指针、条目克制
5. [contracts/PROTOCOL.md](contracts/PROTOCOL.md) —— 跨仓契约:快照 + 关键对齐点 + 变更记录(含"独立核查"列)
6. [CLAUDE.md](CLAUDE.md) / [Agent.md](Agent.md) —— 路由表和全栈总图填好后的样子

## 拿它练手(公司内训用法)

开一个 AI 会话,把本目录当项目根,说「你是产品,开工」——看它能否从 NOW 顺藤摸瓜讲清当前状态;再说「换期到二期」,对照 NOW.md 底部的压缩仪式 checklist,检查它做没做全。

> scripts/ 不在沙盘里:开工护栏等脚本直接用 [templates/scripts/](../templates/scripts/);指挥台操作卡见 [templates/指挥台.md](../templates/指挥台.md)。
