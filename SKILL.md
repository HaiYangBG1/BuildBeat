---
name: solobaton
description: Solobaton —— 人在回路·Builder 协作总线:一个 Builder 指挥多个并行 AI 会话交付中大型项目的方法论 + 可复制脚手架(会话路由/文件总线/四 Gate/三轨/任务包/审批分层/核查门/决策台账/换期压缩仪式/开工护栏脚本/机器闸 pre-commit:gitleaks+bus-check --strict/引导式 Bootstrap:自查代码+少量提问/接管存量项目仪式/证据分级 L0-L4)。当用户要为新的中大型项目搭多会话协作架构、**要给已有的存量老项目套上协作流程(接管)**、提到"Solobaton/协作总线/Builder/人在回路/多 session 协作/AI 团队流程/项目骨架 bootstrap",或抱怨"多个 AI 会话信息不同步、任务过早结束、审批打断过多、review 过于频繁、验收漏验、文档腐烂、返工螺旋"时使用。
---

# Solobaton —— 一个 Builder + N 个 AI 会话交付中大型项目(Builder 协作总线)

> 蒸馏自一个真实跑了多期迭代的实践:单人 + 4 个并行 AI 会话,把一个含前端/BFF/多个后端服务/网关/审计的内部产品从零迭代上线 30+ 次。方法论与项目解耦,模板可直接拷贝。

## 0. 何时用 / 不用

- **用**:项目 ≥ 2 个仓或部署单元、要跑多期迭代、一个人同时扮演 PM/开发/测试/运维、AI 会话之间需要交接。
- **不用**:单仓小任务、一次性脚本、预计一周内收尾的事——直接开一个会话干完,上总线纯属 ceremony(对应 §5 快轨思想)。

## 1. 四根支柱(命根子,所有零件都为它们服务)

1. **真多会话隔离**:每个"域"= 一个独立 AI 会话(独立 cwd / 独立上下文 / 只写自己的文件)。天然抗 context rot,天然实现"写者≠审者"。
2. **人在 Gate**:规格、设计、合并、上线四个决策点必须人拍板,**不可自动跨过**。人只当"节拍器 + 拍板者",不当信息搬运工。
3. **文件总线**:会话间不靠人转述,信息全部走 repo 文件(指针 → 看板 → 契约 → 状态),开工自取。
4. **证据制完成**:任何域声明"完成"必须带 ① commit hash ② 可核验证据(测试命令 / `文件:行` / 线上实测 / 截图)。**无证据 = 没完成。**

> 需求编号可以细,但**执行边界不能跟着编号碎掉**:一个会话同时只认领一个可验收的用户级工作包,通常覆盖多个任务 ID / 文档 / commit;同一工作包可由多个域按各自写边界接力,看板也可容纳少量并行工作包。子产物提交、reviewer 返回、status 回写都只是工作包内事件,不是自动结束会话的理由。

## 2. 域模型(宁少勿多,从 3 个起步)

| 域 | 干什么 | 写哪 |
|---|---|---|
| **产品**(记账/编排) | 拆需求、定契约要点、维护看板与决策台账、派核查门 | `pm/**` |
| **全栈**(实现,含运维) | 实现 + 改契约 + 部署;可同持多仓但**按仓分别 stage** | 代码仓 + `contracts/` |
| **测试**(E2E·走查) | 黑盒 E2E + 视觉回归 + 设计走查,不合格直接提带图 bug | `tests/**` + 证据产物(落 `pm/archive/<期>/evidence/`) |

- **reviewer = review-ready 后才启动的只读 subagent**(不是常驻会话):支持 `milestone`(稳定里程碑候选全核)/ `risk-delta`(冻结后高风险语义定向核)/ `closure`(合并复核 finding 修复)三种模式;一次调用静默核完再返回,不做进度播报,模板见 [templates/.claude/agents/reviewer.md](templates/.claude/agents/reviewer.md)。
- **设计生成 = 外部工具**(可选):产品域写 brief → 人喂设计工具 → 稿落 `design/design_N期/`;走查归测试域。
- **切域依据是"物理边界(仓/部署单元)+ 是否需要独立核查",不是人类公司职能表。** 实践教训:按职能切出 6 个域,两个月内被迫合并回 4 个(前端+后端合并、设计+测试合并)——每多一个域,人的编排成本和信息差面积都翻倍。**合并会丢"天然独立核查"防线,必须用补偿控制顶上**:review-ready 里程碑候选由 reviewer 全核 + 测试域独立核两端;首次 milestone 前写者自行发现的问题先合并收敛,只有修改冻结外部语义/不可逆副作用或 milestone 后新生高风险语义才定向核,不因每次草稿/修复重开 reviewer。

## 3. 文件总线布局

```
<项目根>/                      ← meta 仓(协调层,独立 git;代码各在自己的子仓)
├── AGENTS.md                  # 会话路由 + 总线规则 + 红线(开放标准,每个会话自动装载)
├── CLAUDE.md                  # 一行指针 → AGENTS.md(兼容只认此名的工具;🔴 不复制内容)
├── ARCHITECTURE.md            # 全栈总图:架构/基础设施/凭据位置(只标不写值)/子项目索引(按需读,不自动装载)
├── 指挥台.md                   # 给人看的一页:怎么开每个会话、编排循环
├── contracts/PROTOCOL.md      # 跨边界契约唯一入口(快照+变更记录)
├── design/design_N期/          # 设计稿(每期一目录,必含可渲染 HTML 入口)
├── pm/
│   ├── NOW.md                 # 🔴 薄指针:当前期+看哪些文件。禁堆流水
│   ├── <期>-看板.md            # 当期阶段门/分工/挂账
│   ├── decisions.md           # 🔴 拍板台账(全工作区决策单点)
│   ├── status/<域>.md          # 各域只写自己的(治文件 race)
│   ├── changes/               # 重轨变更 delta 提案 → 拍板 → 归档
│   └── archive/<期>/           # 归档落点;当期证据产物(走查图/E2E报告)生成时即写
│       └── evidence/          #   archive/<期>/evidence/,换期零搬运
├── SOLOBATON.md               # 版本标记:本项目用的哪版 Solobaton + 升级/回灌说明
├── scripts/bus-check.sh       # 开工护栏(见模板)
├── scripts/verify-status.sh   # 工程层验证能力(模板含参考实现,改 SUITES 即接入;--run 真跑并记「上次全绿」)
├── scripts/drift-check.sh     # 生产漂移检测:平台侧 env 指纹+镜像tag↔git vs 基线(见模板)
├── scripts/design-preview.sh  # Gate2 真渲染(见模板)
└── <代码子仓们>/               # 各自独立 git + 该仓自己的 AGENTS.md(只写本仓局部细节)+ CHANGELOG.md
```

**布局二选一(脚本自定位,无需改脚本):** 上面 5 个脚本都向上找「含 `pm/NOW.md` 的目录」当协调层根,不假设自己在哪一层,所以 `scripts/` 整树可以原样搬走。

| 布局 | 协调层落点 | 用在 |
|---|---|---|
| **默认** | `scripts/` + `pm/` + `contracts/` 直接在根 | §8 从零 bootstrap(项目根就是 meta 仓,根上本来没别的东西) |
| **紧凑** | `pm/scripts/*.sh` + `pm/指挥台.md` + `pm/SOLOBATON.md`,根上只多 `pm/` 一个目录 | §8.5 接管存量项目(存量根几乎必有自己的 `scripts/`,协调层混进去会和它的构建/部署脚本搅在一起,Solobaton 的边界从此说不清) |

> 🔴 **一个项目只选一种,并把所有文档里的调用路径统一填成实际那种。** 两种混着写 = 自己造一次 SSOT 腐烂(与规则① 入口唯一 同源)。选了哪种记在 `SOLOBATON.md` 里(单点)。
> 搬不动的东西与布局无关:`AGENTS.md`(+ `CLAUDE.md` 指针)与 `.claude/agents/` 是工具装载约定,永远在项目根。
>
> 🔴 **装载入口走开放标准 `AGENTS.md`,不绑厂商**(教训 15)。标准语义 = 会话从被编辑文件所在目录**向上收集沿途所有 `AGENTS.md` 合并、离得最近的优先**,所以「根写全局、子仓写局部」是白捡的层叠能力,不用自己发明。只认 `CLAUDE.md` 的工具靠根上一份**一行指针**兼容(内容单点在 `AGENTS.md`,复制过去 = 自造 SSOT 腐烂;也别用符号链接,Windows 上 git 默认 `core.symlinks=false` 会静默退化成文本文件)。同理**不要**引入 gitignore 的本地覆盖文件(如 `AGENTS.override.md`):本文件装的是红线与护栏,允许不进 git 的本地覆盖 = 给绕过护栏开后门,reviewer 与 pre-commit 都看不见。

## 4. 总线十条规则(写进项目根 AGENTS.md,模板已含)

1. **唯一看板指针**:入口永远是 `pm/NOW.md` → 当期看板;换期只改 NOW 一处,**看板文件名不得写死进任何别的文档**。
2. **契约落盘不喊话**:跨边界接口先改 `contracts/PROTOCOL.md` 再动代码;收到对方的协议声明**独立核查再信**(实测/读代码/查部署配置),不照单全收。
3. **交接靠 commit + 落盘**:工作包完成或到真实阻塞点 → 状态行带**交付候选/报告** hash,下游读 repo 即知进度,不靠人转述;hash 不是 status 行自身 commit(禁止自引用)。原子 commit 可以多次,但不为每个 commit 单独收尾和打断人;尚无新候选就写已核基线 hash +「无新候选」,不得编 hash。
4. **开工护栏**:任意会话开工先跑 `bash scripts/bus-check.sh` + `git pull`;**部署/改契约/migration 等不可逆动作前再跑一次**(治"会话中途决策已变还按旧信息干");pre-commit 挂 `bus-check --strict` 机器闸(确凿检出 协调层腐烂/幽灵 hash/生产漂移 即非零退出)。
5. **三轨制**:快轨(小改:直接改+核查门)/ 标准轨(单功能:需求→设计→实现→验收)/ 重轨(契约变更/大改:+变更提案+多 agent 评审)。NOW 标本期轨道,别用牛刀杀鸡;工作包默认取一条可独立验收的纵向结果或下一个 Gate/里程碑候选,不按文件、commit 或验收条目拆会话。
6. **核查门(review-ready + 一次候选核查)**:① 轻量机器闸每次提交,受影响测试按批次;首次 milestone reviewer 只在四项同时成立后启动:工作包实现/写者自查完成、所有候选仓 `HEAD=candidate` 且干净、受影响/全量 L3 与真渲染证据绿、无已知待修或计划改 hash。② 首次 milestone 前,鉴权/租户/Secret/fail-closed/持久化等写者自发现问题统一进实现语义清单并自行收敛,不边改边审;只有修改已冻结对外契约或不可逆副作用才 `STOP_NOW`,批准后按一个风险批次核 `risk-delta`。③ 每工作包每 Gate 默认 1 次 milestone;P0/P1 合并修完后 1 次 closure,P2 不复核。reviewer 返回前 hash 变化 → 原审查 `SUPERSEDED`,不得把连续修补包装成 delta 链;重新 review-ready 后再替代。milestone 后新生高风险语义才做 `risk-delta`,同一 hash+绿证据直接复用。**完成 = hash + 可核验证据**;证据分 L0 声称 / L1 `文件:行` / L2 编译·类型 / L3 自动化测试 / L4 线上实测。标准轨最低 L3,重轨与上线必须 L4;L1 只作补充定位。项目测试跑不动 → 先补测试。
7. **变更提案 + 状态分写**:跨域变更走 `pm/changes/` delta 提案;各域只写 `pm/status/<域>.md`,别人只读——物理消灭"同文件互踩"。状态按工作包/里程碑批量更新,不为每个子产物另起一次交接。
8. **视觉问题带图**:提 UI bug / 判设计符合性必附「实现截图 ⟷ 设计稿截图」并排对比,纯文字描述不算证据。
9. **单点事实**:① 线上版本只信 bus-check 实查(任何文档不写"当前线上 vX",契约快照版本仅 PROTOCOL 头部一处)② 每个收敛后的**真实决策包**只在 `decisions.md` 记一行并回写落点;验收条目、推导结论、对话中的部分进度不得膨胀成独立拍板③ 换期必跑压缩仪式。
10. **Gate2 真渲染拍板**:设计拍板对象必须是**真渲染可点原型**(`bash scripts/design-preview.sh <期>`),静态稿/截图不充当拍板对象;设计 brief 必须要求"单 HTML 可渲染入口 + 关键流可点"。**终签同样要含真渲染走查**(spec 数值对 ≠ 渲染对)。

> 十条之外的一条**元原则:能实查的不问人**——查代码 / 配置 / 部署平台能得到的事实,不拿去问用户、不信文档、不信上游转述(规则⑨与规则②的推广;§8 Bootstrap 的提问三原则同源)。

### 4.1 任务包协议:不因子任务完成而过早结束

多步骤工作开工时,从用户目标与当期看板得到一个**任务包信封**;写在当期看板「当前工作包」或在会话开工更新里明确。一个工作包可跨域接力,但每个会话同时只认领一个并遵守自己的写边界;多个独立目标可以并行成多个工作包,不要重新退化成按文件切包。

- `objective`:这轮要交付的用户级结果,不是文件名或动作名。
- `in_scope`:为达成目标可自动继续的关联任务/域/文件边界。
- `terminal_condition`:只有以下三类——目标带证据完成;遇到必须由人处理的真实阻塞;用户明确只要阶段性检查点。

需求 ID、验收项和原子 commit 继续保持细粒度,用于追踪、回滚和验证;**它们不自动成为会话结束条件**。只要仍有安全、可逆、在 `in_scope` 内且能推进 `objective` 的工作,会话就继续做。单个文档提交、一次 reviewer 返回、一次 status 回写、一个 P2 挂账都只发中间进展,不得用 final 把接力棒交还给用户。跨域且当前会话只读时,落盘接力棒并派给有权域/明确真实阻塞,而不是把“请继续”变成人工调度协议。

### 4.2 审批分层:立即停、门前批、无需批

| 层级 | 什么时候 | 会话动作 |
|---|---|---|
| **STOP_NOW 立即停** | 跨 Gate;扩大已批准范围或重开 non-goal;修改**已冻结**对外契约;部署/发布/花费/删除等不可逆外部动作;接受安全或合规风险;权威事实冲突且无法实查 | 停在动作前,一次给出推荐方案、影响和最小问题;获批后继续当前工作包 |
| **BATCH_AT_GATE 门前批** | 冻结前可逆草案选择;已批准目标内的默认值/阈值/失败态归类/实现语义;多个互相关联的产品取舍 | 先记入当期看板「决策收件箱」,继续不依赖该决定的工作;到 Gate 或约定节奏一次提交**默认 2–5 个真实取舍**(确实只有 1 个就单项),每项带推荐值与后果 |
| **NO_APPROVAL 无需批** | 能实查的事实;已批准信封内的派生约束;文案/归档/status/证据整理;普通 P2;不改变外部语义的可逆实现细节 | 自主完成并在证据/状态中说明,不把“告知”包装成“请审批” |

判断顺序:先实查 → 再看是否越过 `in_scope`/Gate/冻结线/不可逆线 → 只有命中 `STOP_NOW` 才立即中断。**人批预算默认每个工作包、每道 Gate 只有 1 个 `BATCH_AT_GATE` 请求**;`STOP_NOW` 是越界例外。未决项不得悄悄固化成冻结事实;若它阻塞当前关键路径,把相关真实取舍合并成同一次提问,不要逐条连环问。用户只回答一部分或要求解释时,保持同一决策包编号,补充说明并更新收件箱,不得另造一轮“新审批”。

### 4.3 决策包:验收条件不是 14 个拍板

产品域先把清单分成两类:① 人必须取舍的**独立决策变量**;② 由已选变量和现有契约推导出的验收约束。只把前者送人批,后者自动写入规格/契约并随候选一起验收。一次 Gate 默认提交 2–5 个决策变量;用户分轮回答时,未收敛项留在「决策收件箱」,收敛后按决策包在 `decisions.md` 记一次,不为“3/14、11/14、14/14”分别制造拍板记录。

## 5. 节奏:四 Gate + 三轨

```
Gate1 规格(人批) → Gate2 设计(人对着真渲染原型批) → 实现+机器闸+实现语义清单 → review-ready 自检 → 稳定里程碑候选核查一次 → Gate3 合并(人批,reviewer 批准≠合并)
→ Gate4 上线(人批) → 测试域复核 → 产品域收尾记账
```
快轨可跳 Gate1/2,但机器闸、证据制与**合并候选一次核查**任何轨都不跳;高风险 delta 不得借快轨绕过独立核查。

## 6. 三个仪式(防腐烂的关键,缺了机制必朽)

- **开工仪式**:bus-check(打印 当前期/契约/最近拍板/各域状态/幽灵 hash 核验/子仓同步/线上实况/生产漂移)→ git pull → 确认要动的不 stale。护栏有机器闸形态:`bus-check --strict` 确凿检出即非零退出,默认由 `scripts/pre-commit.sh` 挂在每次 commit 前(红线3 禁 `--no-verify`,绕不过)——**每条规则问一句「违反了会怎样」,答案是「靠自觉」的就该机器化**。
- **拍板仪式**:产品域先把验收清单压成真实决策变量并批量呈现;用户拍板后 → 产品域**按收敛决策包**在 `decisions.md` 落一行(决策+回写落点)→ 再分发回写各 SSOT。部分对话进度留在看板「决策收件箱」,不污染永久台账。
- **换期压缩仪式**:当期 看板/需求/todo/验收清单 `git mv` 进 `pm/archive/<期>/`;status 全文快照入 archive、live 文件截断只留「基线+最近一条+归档指针」;NOW 流水清零;核对证据产物已在 `archive/<期>/evidence/`、无散落临时文件。**NOW 长肥 = 腐烂开端**——bus-check 的「协调层腐烂检测」会在 NOW 长肥 / 旧看板滞留 / status 超长时开工红字报警(仪式没有护栏 = 没有仪式)。换期同时做**回灌一问**:本期踩到 Solobaton 没覆盖的新坑了吗?有 → 回上游 lessons.md 登记(见项目根 `SOLOBATON.md`)——没有回灌,N 个项目的坑不会变成组织资产,只会各踩各的。

## 7. 红线(每个会话受约束,单点写进根 AGENTS.md §3)

1. **凭据不入 git、不出本机**:文档只标位置不写值;本地 .env 必须 gitignore + 600 权限;Bootstrap 默认装 gitleaks pre-commit 闸(`scripts/pre-commit.sh`),报警即拦——红线不能只靠自觉(lessons 第 10 条)。
2. **不 `git add -A`**:多会话共编,只 stage 自己域的具体文件;同持多仓时按仓分别提交。
3. **不未授权部署**、不 force-push、不 `--amend`、不 `--no-verify`。
4. **每次部署完必更对应仓 CHANGELOG**(Keep a Changelog,倒序)。
5. **写者≠审者**:review-ready 里程碑候选必过独立 reviewer;写者自发现问题先收敛,不送未稳定 hash。P0/P1 合并修完再做一次 closure;同一 hash 复用结论,不靠重复全审制造安全感。
6. 资源选型 **稳定 > 便宜**;长连接服务部署带优雅下线(PreStop/drain)。

## 8. Bootstrap 新项目(引导式:自查 → 少量提问 → 确认 → 生成)

> 🔴 收到「搭骨架 / 用 Solobaton 起项目」类请求时,流程 = **先自查代码 → 只问查不到的 → 一屏确认 → 生成**;不许直接拷模板留 `<占位符>` 让用户手改,也**不许把看代码就能搞清的事拿去问用户**。
> **提问三原则:① 能从代码/配置查到的不问;② 问就问不懂技术的人也能答的话**(话术不出现"仓/部署单元/契约/CLI"这类词,能给选项就不开放问);**③ 合并一次问完(常规 3 问,查到有 UI 时 +1),不连环追问**。有 AskUserQuestion 类工具就用,没有就在对话里问;用户说「你定 / 随便」就取默认值,并在收尾报告标注。

### 8.1 先自查,后提问

**第一步:自查(带证据)。** 扫一遍项目,下表尽量自己填,每项记下依据(文件路径 / 命令输出):

| 要搞清的事 | 怎么自查 | 结论怎么用 |
|---|---|---|
| 几个仓 / 部署单元 | 找各级 `.git`、Dockerfile / compose / CI / 部署配置 | 仅 1 仓 → 结合问题 A 判断是否劝退(§0) |
| 部署平台、有无 CLI | 认平台配置文件;`command -v` 试探平台 CLI | 有 → 实装 `live-status.sh` + `live-config.sh` 并打漂移基线;无 → 留桩,bus-check 会打"未配置"提示 |
| 有无 UI | 前端依赖(package.json 等)/ HTML / 客户端工程 | 无 UI → 删 AGENTS.md §1.5、Gate2 降为规格确认、reviewer 清单删第 5/6 条 |
| 契约边界 | 读跨服务调用代码(HTTP client / API 路由),**自己起草**边界清单 | 草稿填 PROTOCOL.md §1 并标「待确认」;单仓内部接口走共享类型/schema,不进 PROTOCOL |
| 项目名 / 技术栈 | README / 包管理文件 | 填模板各处 <占位符> |

**第二步:只问自查不出来的(通常就剩这三四件):**

| 问题(示例话术) | 答案怎么用 |
|---|---|
| A.「这个项目是几天就收尾,还是要长期做下去?」 | 几天收尾 + 单仓 → **劝退**:单会话直接干,不搭总线,到此为止 |
| B.「除了你,还有别人也会开 AI 会话一起干活吗?」 | 默认全部会话由你一人指挥;有同事 → 域表标注谁管哪个域 |
| C.「我默认配三个分工会话:**产品**(拆需求、管进度、记决策)、**全栈**(写代码、管上线)、**测试**(验收挑毛病)。就按这个来,还是要增减/改名?」 | 默认 → 三域生成(§2);自定义 → 按"物理边界 + 是否需要独立核查"帮用户调,宁少勿多——每多一个域,编排成本翻倍(§2 实践教训) |
| D.(自查到有 UI 才问)「界面效果谁说了算——有设计工具/设计师出稿,还是做出来你看着提意见?」 | 有稿 → Gate2 走真渲染拍板全流程;无稿 → Gate2 简化为"实现后真渲染给你过目再上线" |

**第三步:一屏确认再动手。** 把「自查结论(带证据)+ 你的回答 + 我按默认拿主意的项」汇成一屏给用户点头——点头即本项目第一次拍板(落 decisions.md,见 8.2 第 5 步),然后才开始生成。

### 8.2 生成 checklist(确认过后由 agent 执行)

```
- [ ] 1. 拷贝 templates/ 整树(`cp -R templates/. <新项目根>/`,`/.` 结尾才带上隐藏的 `.claude/`);**全部 <占位符> 按自查+确认结论填好,交付物里不得残留任何 <占位符>**;按有无 UI 删/留相关段落;`SOLOBATON.md` 填上拷入的版本号(对照上游 CHANGELOG 最新版)
- [ ] 2. meta 仓 git init + 远端;代码子仓各自独立 git;meta 仓 .gitignore 排除子仓目录与一切 *.env(拷 `templates/gitignore.template` 改名 `.gitignore`,替换子仓名)
- [ ] 3. 域表按问题 B/C 落根 AGENTS.md §1 路由表(cwd / 可写 / 只读边界)
- [ ] 4. 按自查结果接"线上实况"与漂移基线:实装则 `bash scripts/drift-check.sh --update-baseline` 打首版基线;无平台则留桩;有测试命令则改 `scripts/verify-status.sh` 的 SUITES 接入(工程层验证能力,bus-check 会打;没有测试就留占位符,如实红字)
- [ ] 5. 第一期立项:pm/NOW.md 填当前期与轨道 → 建 <一期>-看板.md,填首个「当前工作包」的 objective/in_scope/terminal_condition 与空的决策收件箱 → decisions.md 第一行记「Bootstrap 结论」(自查+确认:域表/轨道/平台/UI 取舍——本项目第一次拍板)
- [ ] 6. 跑 `bash scripts/bus-check.sh` 自检骨架(输出齐全、无报错),把输出贴给用户过目
- [ ] 7. 装机器闸(**默认,非可选**):meta 仓与各代码子仓逐仓 `cp scripts/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`(紧凑布局下拷贝源为 `pm/scripts/pre-commit.sh`)(gitleaks 拦凭据 + meta 仓 bus-check --strict 拦腐烂/幽灵 hash);`command -v gitleaks` 查无则提醒用户安装,并记入收尾报告
- [ ] 8. (可选)装 Stop hook 自动 push 已 commit 内容(secret 闸已在第 7 步默认上;要更稳可在 push 前再跑一道 `gitleaks dir <仓根>`)
- [ ] 9. 收尾报告一屏:生成了什么 / 按自查+确认做了哪些取舍(含默认值项)/ 下一步开哪个会话、说哪句话(参照 指挥台.md)
```

> 各文件「填好之后长什么样」,参照仓库 [example/](example/)(虚构「简账」项目跑完一期的快照)。

## 8.5 接管存量项目(10→N 入口:先摸底、划边界、补验证)

> §8 假设从零起步;公司里大多数项目是**存量**的,两类项目的成本结构相反:0→1 的瓶颈是需求不确定,10→N 的瓶颈是**理解成本 ≫ 编写成本**、改坏的损失 ≫ 改对的收益。收到「给现有项目上 Solobaton」类请求走本节,别拿 §8 硬套;提问三原则(§8)同样适用。

```
- [ ] 1. 摸底(全自查,不问人):规模(文件/行数)、模块依赖、测试现状(几个测试/能不能跑/跑多久)、
        危险区(被广泛依赖、一改炸全站的模块)、分支状态(落后多少/几个长命分支)→ 摸底报告一屏给用户
- [ ] 2. 划绞杀者边界(用户拍板):「新地盘」(新功能/新模块)走全套总线;「老地盘」只维护、改动一律重轨。
        边界写进根 AGENTS.md §1 与 PROTOCOL——同一项目里两种速度,不是折中成一种。
        只问两个人话问题:「这项目还要长期投入吗?」「哪块最怕改坏?」(危险区,人比代码清楚)
- [ ] 3. 第 0 期 = 补最小验证套件(强制,不做业务需求):核心链路 E2E 起步 + 接 scripts/verify-status.sh。
        没有这一步,证据分级给不出 L3,后面所有 Gate 都在空转
- [ ] 4. 产出分层 AGENTS.md:根一份(路由 + 新旧边界)+ 各业务模块一份(模块地图,给 AI 会话降理解成本)。
        靠标准的「向上合并、就近优先」层叠:改哪个模块只额外装载哪份,根文件因此能保持精简
- [ ] 5. 骨架用**紧凑布局**(§3):`templates/scripts/` 整树拷成 `pm/scripts/`,`指挥台.md` 与 `SOLOBATON.md` 拷进 `pm/`。
        脚本自定位不用改;要改的是文档里的调用路径——`AGENTS.md`、`pm/NOW.md`、`指挥台.md`、`pm/当期看板.md`、`contracts/PROTOCOL.md`、`ARCHITECTURE.md` 六处,
        改完 `grep -rn 'scripts/' <项目根> --include='*.md'` 复核:只该剩 `pm/scripts/` 与项目自己的 `scripts/`
- [ ] 6. 之后按 §8.2 步骤 2-9 走(骨架/机器闸/第一期立项);一期起步的优先级:补测试 > 机械重构 > 新功能
```

## 9. 模板索引(templates/,直接拷贝后改占位符)

| 模板 | 用途 |
|---|---|
| [templates/AGENTS.md](templates/AGENTS.md) | 工作区路由 + 十条规则 + 红线(开放标准,每会话自动装载) |
| [templates/CLAUDE.md](templates/CLAUDE.md) | 一行指针 → `AGENTS.md`(兼容只认此名的工具;🔴 不复制内容) |
| [templates/ARCHITECTURE.md](templates/ARCHITECTURE.md) | 全栈总图骨架(架构/基础设施/凭据位置/子项目索引) |
| [templates/指挥台.md](templates/指挥台.md) | 给人看的一页操作卡 |
| [templates/pm/NOW.md](templates/pm/NOW.md) | 薄指针 + 换期压缩仪式 checklist |
| [templates/pm/当期看板.md](templates/pm/当期看板.md) | 当前工作包/决策收件箱/阶段门/分工/挂账骨架 |
| [templates/pm/decisions.md](templates/pm/decisions.md) | 收敛后的决策包台账 |
| [templates/pm/status/README.md](templates/pm/status/README.md) | 状态分写约定 + 域文件模板 |
| [templates/pm/changes/README.md](templates/pm/changes/README.md) | 重轨变更 delta 提案流程 + 模板 |
| [templates/contracts/PROTOCOL.md](templates/contracts/PROTOCOL.md) | 契约唯一入口骨架 |
| [templates/.claude/agents/reviewer.md](templates/.claude/agents/reviewer.md) | 只读核查门 subagent(`milestone` / `risk-delta` / `closure`) |
| [templates/scripts/bus-check.sh](templates/scripts/bus-check.sh) | 开工护栏(含 live-status 钩子、子仓同步、最近拍板、幽灵 hash 核验、漂移检测集成;`--strict` 机器闸模式) |
| [templates/scripts/pre-commit.sh](templates/scripts/pre-commit.sh) | 红线机器闸五道:gitleaks 拦凭据 / bus-check --strict 拦腐烂·幽灵hash / 多域 status 拦 / 批量 stage 拦 / 契约同步提醒(逐仓拷进 `.git/hooks/pre-commit`) |
| [templates/scripts/drift-check.sh](templates/scripts/drift-check.sh) | 生产漂移检测(env 指纹基线 + 镜像tag↔git 锚定;🔴只存指纹不存值) |
| [templates/scripts/design-preview.sh](templates/scripts/design-preview.sh) | Gate2 真渲染静态服务 |
| [templates/scripts/verify-status.sh](templates/scripts/verify-status.sh) | 工程层验证能力参考实现(SUITES 表 + `--run` 记「上次全绿」标记;L3 证据兜底) |
| [templates/gitignore.template](templates/gitignore.template) | meta 仓 .gitignore 模板(排除子仓与 *.env;拷入后改名) |
| [templates/SOLOBATON.md](templates/SOLOBATON.md) | 版本标记 + 布局标记 + 升级路径 + 回灌通道(拷入后填) |

> 5 个 `.sh` 自己定位协调层根(向上找 `pm/NOW.md`),整树搬到 `pm/scripts/` 即得 §3 紧凑布局,脚本本身不用改。同伴脚本(`live-status.sh` / `live-config.sh`)要和它们放同一目录。

## 10. 反模式与实战教训

血泪清单(每条都真实发生过)见 [lessons.md](lessons.md)——SSOT 腐烂、读过期 race、静态稿拍板返工螺旋、域过细收敛史、"当前版本"声明漂移、走查漏独立弹窗、状态条目膨胀、风险清单被新功能挤掉、状态里的幽灵 hash、构建产物混入他人 WIP、平台侧配置漂移、UI 元注释复发等。**搭完骨架后建议通读一遍,大部分零件就是为这些坑而生。**
