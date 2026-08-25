# example/ —— 教学沙盘:虚构项目「简账」跑完一期的快照

> 这里的协议骨架文件展示 `templates/` 对应模板**填好项目事实之后的样子**，status/evidence 则是虚构一期的教学产物；沙盘也刻意启用了可选 standards 与一个 ADR，用来展示“默认不生成、选择后由项目拥有”的完成态。
> 🔴 项目、数据、人物、决策全部虚构(已脱敏);commit hash 均为示意值——真项目里 hash 必须真实可查(`git cat-file -t <hash>`,见 [lessons.md](../lessons.md) 第 11 条)。
> [`.buildbeat/manifest.json`](.buildbeat/manifest.json) 是 schema 2 的**合成教学快照**：其 baseline hash 会由本仓机器检查锁定到当前示例字节，但它不证明 npm artifact 或真实 CLI 写过这些文件，也不是可复制到真实项目的受管基线。

## 沙盘设定

- **项目**:「简账」—— 网页记账应用(就是主 README §2 举例的那个)
- **仓**:`jz-web`(前端 React)+ `jz-api`(后端 Node + SQLite),各自独立 git
- **工作包所有权**:同一 Builder 端到端负责;产品 / 全栈 / 测试是 AI 专业视角;**轨道**:标准轨;**部署**:示例 PaaS(沙盘不接真平台)
- **进度**:一期(记账主流程 + 月度报表)已跑完 Gate1→Gate4 上线,尚未换期

## 怎么读(建议顺序)

1. [pm/NOW.md](pm/NOW.md) —— 任何会话开工第一眼:当前期是什么、去看哪些文件
2. [pm/一期-看板.md](pm/一期-看板.md) —— 当前工作包如何覆盖多个子项、决策收件箱如何批量收敛,以及阶段门/分工/挂账
3. [pm/decisions.md](pm/decisions.md) —— 拍板台账:收敛后的真实决策包 + BuildBeat 升级记录(注意部分回答不单独记行)
4. [pm/status/](pm/status/) —— 三个 AI 视角各写各的状态:带 hash、带证据指针,按工作包/里程碑更新而非每个子任务一条
5. [pm/archive/一期/evidence/](pm/archive/一期/evidence/) —— 完成工作包和 Gate 令牌引用的可核验证据落点
6. [contracts/PROTOCOL.md](contracts/PROTOCOL.md) —— 跨仓契约:快照 + 关键对齐点 + 变更记录(含"独立核查"列)
7. [AGENTS.md](AGENTS.md) / [ARCHITECTURE.md](ARCHITECTURE.md) —— 路由表和全栈总图填好后的样子(根上另有 [CLAUDE.md](CLAUDE.md),只是指向 `AGENTS.md` 的一行指针)
8. [standards/](standards/) —— 已确认的 STACK/CODE/REVIEW/DESIGN；普通项目可以完全没有此目录
9. [pm/adr/](pm/adr/) —— 长期技术决定与替代链；普通拍板仍只进 decisions.md
10. [.buildbeat/manifest.json](.buildbeat/manifest.json) —— schema 2 字段、所有权策略与 baseline hash 的教学快照

## Gate 四态怎么写

`pm/一期-看板.md` 是已完成一期的 live 快照，因此四行都是 `passed`。下面只是语法对照，不要再追加到同一份看板：

```md
- Gate1: pending
- Gate2: passed | 决策: `pm/decisions.md:16` | 证据: `pm/archive/一期/evidence/gate2.md`
- Gate3: blocked | 理由: `实现候选尚有 P1 待修`
- Gate4: n/a | 理由: `本工作包无部署或生产发布交付`
```

`n/a` 必须同行带非占位的 `理由:`；`passed` 应同行指向已存在的决策表行或归档证据。`blocked` 也应说明真实阻塞，不把“还没做”包装成审批。

## 域回复示例

下面展示一期实现候选形成时,全栈视角如何面向人收口。这是回复格式示例,status 和证据文件仍是持久事实。

```md
## 全栈视角｜✅ 已完成

### 已做

1. 记账主流程和月度报表已形成可验收候选。
   - 证据：`pm/archive/一期/evidence/implementation.md`

### 未做

1. 黑盒 E2E 和带图走查。
   - 原因：需要测试视角独立验收当前候选。

### 下一步

- **本域已完成：** 下一棒是测试视角，负责黑盒 E2E 和带图走查。
```

## Manifest 的教学边界

- `files` 只记录这份合成快照声明的 8 个基线路径；当前文档字节与 `baselineSha256` 一致，是为了防止教材漂移，不是为 legacy 项目追认历史所有权。
- 可选 `standards/`、`pm/adr/`、业务 status 与 evidence 是基线后的 project-owned 教学内容，不进 manifest。
- 为避免复制可执行 SSOT，沙盘仍从上游引用 scripts/指挥台/Hook；所以这不是可用 `doctor` 证明健康的完整 CLI 安装。
- 真实 v1.16 拷出项目必须按 [legacy 迁移指南](../docs/LEGACY-V1.16-MIGRATION.md) 处理；不得复制本 manifest、重命名 `.solobaton` 文件，或把当前已改过的文件 hash 伪装成安装基线。

## 拿它练手(公司内训用法)

开一个 AI 会话,把本目录当项目根,说「你是当前工作包的产品视角,开工」——看它能否从 NOW 顺藤摸瓜讲清当前状态;再说「换期到二期」,对照 NOW.md 底部的压缩仪式 checklist,检查它做没做全。

若把模板脚本复制进本目录运行 `bus-check --strict`,示意 commit 会按设计触发 `sync.ghost_hash`：这是给教学沙盘保留的负例,不是可发布候选的绿灯。真项目必须换成仓库中可解析的真实 hash；删除或豁免检查都不算修复。

> scripts/ 不在沙盘里:开工护栏等脚本直接用 [templates/scripts/](../templates/scripts/);指挥台操作卡见 [templates/指挥台.md](../templates/指挥台.md)。
