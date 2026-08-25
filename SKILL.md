---
name: buildbeat
description: BuildBeat（旧称 Solobaton）—— 面向人和 AI 会话的工程交付协议:帮助一个或多个端到端 Builder 通过 Git 文件总线、四个人工 Gate 和可验证证据闭环需求/功能工作包;产品/全栈/测试是可调用的 AI 专业视角,不是人类岗位流水线。包含会话路由/文件总线/三轨/任务包/审批分层/核查门/决策台账/换期压缩仪式/开工护栏脚本/机器闸 pre-commit:gitleaks+bus-check --strict/引导式 Bootstrap:自查代码+少量提问/接管存量项目仪式/已发布 legacy CLI v0 只读证据与源码候选 init/adopt 受控写入/证据分级 L0-L4。当用户要为新的中大型项目搭多会话协作架构、**要给已有的存量老项目套上协作流程(接管)**、提到"BuildBeat/Solobaton/协作总线/Builder/人在回路/多 session 协作/AI 团队流程/项目骨架 bootstrap",或抱怨"多个 AI 会话信息不同步、任务过早结束、审批打断过多、review 过于频繁、验收漏验、文档腐烂、返工螺旋"时使用。
---

# BuildBeat —— 面向人和 AI 会话的工程交付协议

> 蒸馏自一个真实跑了多期迭代的实践:一个人协调 4 个并行 AI 会话,把一个含前端/BFF/多个后端服务/网关/审计的内部产品持续交付。这个案例说明来源,不限定人数;一个 Builder 可用,多个 Builder 也可共享 Git 后按工作包分别闭环。方法论与项目解耦,模板可直接拷贝。

## 0. 何时用 / 不用

- **用**:项目要跑多期迭代,或存在多个仓/部署单元/AI 上下文;一个或多个 Builder 需要让需求、契约、状态、Gate 与证据长期同步。
- **不用**:单仓小任务、一次性脚本、预计一周内收尾的事——直接开一个会话干完,上总线纯属 ceremony(对应 §5 快轨思想)。

## 1. 四根支柱(命根子,所有零件都为它们服务)

1. **端到端工作包**:一个 Builder 对一个需求/功能工作包的产品判断、实现、测试、合并与发布证据负责;需要隔离时再调用独立 AI 视角(独立 cwd / 上下文 / 写边界)。
2. **人在 Gate**:规格、设计、合并、上线四个决策点必须人拍板,**不可自动跨过**。人只当"节拍器 + 拍板者",不当信息搬运工。
3. **文件总线**:会话间不靠人转述,信息全部走 repo 文件(指针 → 看板 → 契约 → 状态),开工自取。
4. **证据制完成**:任何工作包声明"完成"必须带 ① commit hash ② 可核验证据(测试命令 / `文件:行` / 线上实测 / 截图)。**无证据 = 没完成。**

> 需求编号可以细,但**执行边界不能跟着编号碎掉**:一个 Builder 同时认领一个可验收的用户级工作包,通常覆盖多个任务 ID / 文档 / commit;同一工作包可调用多个 AI 视角按各自写边界协作,看板也可容纳少量并行工作包。多个 Builder 默认按项目/需求工作包切分,不按人类产品→研发→测试岗位接力。子产物提交、reviewer 返回、status 回写都只是工作包内事件,不是自动结束会话的理由。

## 2. 工作包所有权与 AI 专业视角

**人类责任按工作包端到端闭环。** 下表是同一 Builder 可调用的默认 AI 视角,用于上下文和写边界隔离;它不是成员目录、岗位分工或审批链。多个 Builder 协作时各自拥有不同工作包,共享契约冲突线下收敛后只落最终事实。

| AI 视角 | 在当前工作包内做什么 | 典型写入边界 |
|---|---|---|
| **产品**(记账/编排) | 拆需求、定契约要点、维护看板与决策台账、派核查门 | `pm/**` |
| **全栈**(实现,含运维) | 实现 + 改契约 + 部署;可同持多仓但**按仓分别 stage** | 代码仓 + `contracts/` |
| **测试**(E2E·走查) | 黑盒 E2E + 视觉回归 + 设计走查,不合格直接提带图 bug | `tests/**` + 证据产物(落 `pm/archive/<期>/evidence/`) |

- **reviewer = review-ready 后才启动的只读 subagent**(不是常驻会话):支持 `milestone`(稳定里程碑候选全核)/ `risk-delta`(冻结后高风险语义定向核)/ `closure`(合并复核 finding 修复)三种模式;一次调用静默核完再返回,不做进度播报,模板见 [templates/.claude/agents/reviewer.md](templates/.claude/agents/reviewer.md)。
- **设计生成 = 外部工具**(可选):当前工作包的产品视角写 brief → 人喂设计工具 → 稿落 `design/design_N期/`;走查归测试视角。
- **拆 AI 视角的依据是"物理边界(仓/部署单元)+ 是否需要独立核查",不是人类公司职能表。** 实践教训:按职能切出 6 个会话,两个月内被迫合并回 4 个(前端+后端合并、设计+测试合并)——每多一个上下文,编排成本和信息差面积都扩大。合并视角会丢"天然独立核查"防线,必须用补偿控制顶上:review-ready 里程碑候选由 reviewer 全核 + 测试视角独立核两端;首次 milestone 前写者自行发现的问题先合并收敛,只有修改冻结外部语义/不可逆副作用或 milestone 后新生高风险语义才定向核,不因每次草稿/修复重开 reviewer。

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
│   ├── status/{视角}.md        # 各 AI 视角只写自己的(治文件 race)
│   ├── changes/               # 重轨变更 delta 提案 → 拍板 → 归档
│   └── archive/<期>/           # 归档落点;当期证据产物(走查图/E2E报告)生成时即写
│       └── evidence/          #   archive/<期>/evidence/,换期零搬运
├── BUILDBEAT.md               # 版本标记:本项目用的哪版 BuildBeat + 升级/回灌说明
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
| **紧凑** | `pm/scripts/*.sh` + `pm/指挥台.md` + `pm/BUILDBEAT.md`,根上只多 `pm/` 一个目录 | §8.5 接管存量项目(存量根几乎必有自己的 `scripts/`,协调层混进去会和它的构建/部署脚本搅在一起,BuildBeat 的边界从此说不清) |

> 🔴 **一个项目只选一种,并把所有文档里的调用路径统一填成实际那种。** 两种混着写 = 自己造一次 SSOT 腐烂(与规则① 入口唯一 同源)。选了哪种记在 `BUILDBEAT.md` 里(单点)。旧项目的 `SOLOBATON.md` 仍可只读识别，但新骨架不再生成旧名。
> 搬不动的东西与布局无关:`AGENTS.md`(+ `CLAUDE.md` 指针)与 `.claude/agents/` 是工具装载约定,永远在项目根。
>
> 🔴 **装载入口走开放标准 `AGENTS.md`,不绑厂商**(教训 15)。标准语义 = 会话从被编辑文件所在目录**向上收集沿途所有 `AGENTS.md` 合并、离得最近的优先**,所以「根写全局、子仓写局部」是白捡的层叠能力,不用自己发明。只认 `CLAUDE.md` 的工具靠根上一份**一行指针**兼容(内容单点在 `AGENTS.md`,复制过去 = 自造 SSOT 腐烂;也别用符号链接,Windows 上 git 默认 `core.symlinks=false` 会静默退化成文本文件)。同理**不要**引入 gitignore 的本地覆盖文件(如 `AGENTS.override.md`):本文件装的是红线与护栏,允许不进 git 的本地覆盖 = 给绕过护栏开后门,reviewer 与 pre-commit 都看不见。

## 4. 总线十条规则(写进项目根 AGENTS.md,模板已含)

1. **唯一看板指针**:入口永远是 `pm/NOW.md` → 当期看板;换期只改 NOW 一处,**看板文件名不得写死进任何别的文档**。
2. **契约落盘不喊话**:跨边界接口先改 `contracts/PROTOCOL.md` 再动代码;收到对方的协议声明**独立核查再信**(实测/读代码/查部署配置),不照单全收。
3. **交接靠 commit + 落盘**:工作包完成或到真实阻塞点 → 状态行带**交付候选/报告** hash,下游读 repo 即知进度,不靠人转述;hash 不是 status 行自身 commit(禁止自引用)。原子 commit 可以多次,但不为每个 commit 单独收尾和打断人;尚无新候选就写已核基线 hash +「无新候选」,不得编 hash。
4. **开工护栏**:任意会话开工先跑 `bash scripts/bus-check.sh` + `git pull`;**部署/改契约/migration 等不可逆动作前再跑一次**(治"会话中途决策已变还按旧信息干");pre-commit 挂 `bus-check --strict` 机器闸(任一 `conflict/error` finding 即非零退出;`warning/unverified` 保持可见但不拦)。
5. **三轨制**:快轨(小改:直接改+核查门)/ 标准轨(单功能:需求→设计→实现→验收)/ 重轨(契约变更/大改:+变更提案+多 agent 评审)。NOW 标本期轨道,别用牛刀杀鸡;工作包默认取一条可独立验收的纵向结果或下一个 Gate/里程碑候选,不按文件、commit 或验收条目拆会话。
6. **核查门(review-ready + 一次候选核查)**:① 轻量机器闸每次提交,受影响测试按批次;首次 milestone reviewer 只在四项同时成立后启动:工作包实现/写者自查完成、所有候选仓 `HEAD=candidate` 且干净、受影响/全量 L3 与真渲染证据绿、无已知待修或计划改 hash。② 首次 milestone 前,鉴权/租户/Secret/fail-closed/持久化等写者自发现问题统一进实现语义清单并自行收敛,不边改边审;只有修改已冻结对外契约或不可逆副作用才 `STOP_NOW`,批准后按一个风险批次核 `risk-delta`。③ 每工作包每 Gate 默认 1 次 milestone;P0/P1 合并修完后 1 次 closure,P2 不复核。reviewer 返回前 hash 变化 → 原审查 `SUPERSEDED`,不得把连续修补包装成 delta 链;重新 review-ready 后再替代。milestone 后新生高风险语义才做 `risk-delta`,同一 hash+绿证据直接复用。**完成 = hash + 可核验证据**;证据分 L0 声称 / L1 `文件:行` / L2 编译·类型 / L3 自动化测试 / L4 线上实测。标准轨最低 L3,重轨与上线必须 L4;L1 只作补充定位。项目测试跑不动 → 先补测试。
7. **变更提案 + 状态分写**:跨工作包/共享边界变更走 `pm/changes/` delta 提案;各 AI 视角只写 `pm/status/{视角}.md`,别人只读——物理消灭"同文件互踩"。状态按工作包/里程碑批量更新,不为每个子产物另起一次交接。
8. **视觉问题带图**:提 UI bug / 判设计符合性必附「实现截图 ⟷ 设计稿截图」并排对比,纯文字描述不算证据。
9. **单点事实**:① 线上版本只信 bus-check 实查(任何文档不写"当前线上 vX",契约快照版本仅 PROTOCOL 头部一处)② 每个收敛后的**真实决策包**只在 `decisions.md` 记一行并回写落点;验收条目、推导结论、对话中的部分进度不得膨胀成独立拍板③ 换期必跑压缩仪式。
10. **Gate2 真渲染拍板**:设计拍板对象必须是**真渲染可点原型**(`bash scripts/design-preview.sh <期>`),静态稿/截图不充当拍板对象;设计 brief 必须要求"单 HTML 可渲染入口 + 关键流可点"。**终签同样要含真渲染走查**(spec 数值对 ≠ 渲染对)。

> 十条之外的一条**元原则:能实查的不问人**——查代码 / 配置 / 部署平台能得到的事实,不拿去问用户、不信文档、不信上游转述(规则⑨与规则②的推广;§8 Bootstrap 的提问三原则同源)。

### 4.1 任务包协议:不因子任务完成而过早结束

多步骤工作开工时,从用户目标与当期看板得到一个**任务包信封**;写在当期看板「当前工作包」或在会话开工更新里明确。一个工作包可跨域接力,但每个会话同时只认领一个并遵守自己的写边界;多个独立目标可以并行成多个工作包,不要重新退化成按文件切包。

- `objective`:这轮要交付的用户级结果,不是文件名或动作名。
- `in_scope`:为达成目标可自动继续的关联任务/AI视角/文件边界。
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

当前工作包的产品视角先把清单分成两类:① 人必须取舍的**独立决策变量**;② 由已选变量和现有契约推导出的验收约束。只把前者送人批,后者自动写入规格/契约并随候选一起验收。一次 Gate 默认提交 2–5 个决策变量;用户分轮回答时,未收敛项留在「决策收件箱」,收敛后按决策包在 `decisions.md` 记一次,不为“3/14、11/14、14/14”分别制造拍板记录。

## 5. 节奏:四 Gate + 三轨

```
Gate1 规格(人批) → Gate2 设计(人对着真渲染原型批) → 实现+机器闸+实现语义清单 → review-ready 自检 → 稳定里程碑候选核查一次 → Gate3 合并(人批,reviewer 批准≠合并)
→ Gate4 上线(人批) → 测试视角复核 → 当前工作包 Builder/产品视角收尾记账
```
快轨可跳 Gate1/2,但机器闸、证据制与**合并候选一次核查**任何轨都不跳;高风险 delta 不得借快轨绕过独立核查。

## 6. 四个仪式(防腐烂的关键,缺了机制必朽)

### 6.1 开工同步(7 步)

1. 跑 `bash scripts/bus-check.sh`(紧凑布局改实际路径),先看 conflict/error,再看 warning/unverified 覆盖面。
2. 协调层与每个要动的子仓分别 `git pull`;无上游或离线必须明说,不伪称已同步。
3. 按 `pm/NOW.md → 当期看板 → contracts → decisions → status/evidence` 读承重事实。
4. 从看板认领一个端到端工作包,确认 `objective / in_scope / terminal_condition`。
5. 核对要动的文件、契约、candidate hash 与现有自动化证据没有 stale。
6. 确认当前 Gate/冻结线与审批级别;不可逆动作前必须再跑一遍开工同步。
7. 只在确认写边界后动手;无法实查的范围记为 `unverified`,不猜。

`bus-check --strict` 是机器闸:只对规格中的 conflict/error 非零退出,默认由 `scripts/pre-commit.sh` 挂在每次 commit 前。**每条规则都问「违反了会怎样」;答案只是「靠自觉」时,就该机器化。**

### 6.2 执行中同步(5 守则)

1. 契约/决策先落权威文件,再改共享实现;冻结后的语义 delta 命中 `STOP_NOW`。
2. 原子 commit 可以细,但 status 只在工作包里程碑候选、完成或真实阻塞时批量更新。
3. 不边改 candidate 边开 reviewer;先自查收敛到 review-ready,同一 hash 复用结论。
4. 新事实若使 NOW/看板/contracts/status/evidence 失配,在同一变更批次内修回;不等收工补旧账。
5. 对无法验证、扫描截断、适配器缺失或远端未回读的部分保留 `unverified`,不把局部绿外推为全局通过。

### 6.3 收工同步(7 步)

1. 确认工作包达到 `terminal_condition`,不把单个子产物当完成。
2. 跑受影响测试;里程碑候选再跑全量 L3/真渲染,记录命令与结果证据。
3. 回读 candidate/report hash,确保状态中的 hash 真实可解析且不是 status 自身提交。
4. 回写 contracts/decisions/当期看板/status,已完成工作包必须有一条 `**证据**:` 并指向可核验产物。
5. 跑 `bash scripts/bus-check.sh --strict` 并阅读非阻断的 warning/unverified;不用 exit 0 替代覆盖面判断。
6. 确认各仓工作树与 staged 范围;他人 WIP、散落临时文件或计划中的 candidate 修改未收敛时,不声称 review-ready。
7. 一屏收尾:交付结果、证据、未验证边界、挂账/真实阻塞、是否命中下一道人工 Gate。

### 6.4 拍板仪式

当前工作包的产品视角先把验收清单压成真实决策变量并批量呈现;用户拍板后 → 该视角**按收敛决策包**在 `decisions.md` 落一行(决策+回写落点)→ 再分发回写各 SSOT。部分对话进度留在看板「决策收件箱」,不污染永久台账。

### 6.5 换期压缩仪式

当期看板/需求/todo/验收清单 `git mv` 进 `pm/archive/<期>/`;status 全文快照入 archive、live 文件截断只留「基线+最近一条+归档指针」;NOW 流水清零;核对证据产物已在 `archive/<期>/evidence/`、无散落临时文件。**NOW 长肥 = 腐烂开端**——bus-check 会在 NOW 长肥 / 旧看板滞留 / status 超长时报警。换期同时做**回灌一问**:本期踩到 BuildBeat 没覆盖的新坑了吗?有 → 回上游 `lessons.md` 登记。

## 7. 红线(每个会话受约束,单点写进根 AGENTS.md §3)

1. **凭据不入 git、不出本机**:文档只标位置不写值;本地 .env 必须 gitignore + 600 权限;Bootstrap 默认装 gitleaks pre-commit 闸(`scripts/pre-commit.sh`),报警即拦——红线不能只靠自觉(lessons 第 10 条)。
2. **不 `git add -A`**:多会话共编,只 stage 自己域的具体文件;同持多仓时按仓分别提交。
3. **不未授权部署**、不 force-push、不 `--amend`、不 `--no-verify`。
4. **每次部署完必更对应仓 CHANGELOG**(Keep a Changelog,倒序)。
5. **写者≠审者**:review-ready 里程碑候选必过独立 reviewer;写者自发现问题先收敛,不送未稳定 hash。P0/P1 合并修完再做一次 closure;同一 hash 复用结论,不靠重复全审制造安全感。
6. 资源选型 **稳定 > 便宜**;长连接服务部署带优雅下线(PreStop/drain)。

## 8. Bootstrap 新项目(引导式:自查 → 少量提问 → 确认 → 生成)

> 🔴 收到「搭骨架 / 用 BuildBeat 起项目」类请求时,流程 = **先自查代码 → 只问查不到的 → 一屏确认 → 生成**;不许直接拷模板留 `<占位符>` 让用户手改,也**不许把看代码就能搞清的事拿去问用户**。
> **提问三原则:① 能从代码/配置查到的不问;② 问就问不懂技术的人也能答的话**(话术不出现"仓/部署单元/契约/CLI"这类词,能给选项就不开放问);**③ 合并一次问完(常规 3 问,查到有 UI 时 +1),不连环追问**。有 AskUserQuestion 类工具就用,没有就在对话里问;用户说「你定 / 随便」就取默认值,并在收尾报告标注。
>
> **CLI 是确定性机械层,不是 Bootstrap 替身。** 旧 npm 包 `solobaton` 已发布的 v0 仍只读；当前未发布源码候选可先运行 `node bin/buildbeat.js init <项目根> --dry-run --json`,存量项目改用 `adopt ... --dry-run --json`。旧 `bin/solobaton.js` 只作为迁移别名保留。把仓/部署标记/UI/测试/碰撞结果作为自查证据,随后仍要读代码、只问剩余问题并做一屏确认。只有同一屏已获用户确认且 dry-run 无 blocker,才可用源码候选去掉 `--dry-run` 交互写入；非交互时 `--yes` 只复用这次确认,不能绕过碰撞/脏 Git/路径检查。CLI 只填确定项,必须继续按输出的 `pendingPlaceholders` 完成语义渲染；不得声称它已初始化 Git、安装 Hook、跨 Gate 或发布 npm。

### 8.1 先自查,后提问

**第一步:自查(带证据)。** 扫一遍项目,下表尽量自己填,每项记下依据(文件路径 / 命令输出):

若使用 CLI JSON,只能把 `detected` 当作结构化线索:扫描最多四层/5,000 条目且跳过 build/vendor/symlink,所以 `scanTruncated=true`、未识别测试或未识别 UI 都是“未确定”,不是“不存在”。

| 要搞清的事 | 怎么自查 | 结论怎么用 |
|---|---|---|
| 几个仓 / 部署单元 | 找各级 `.git`、Dockerfile / compose / CI / 部署配置 | 仅 1 仓 → 结合问题 A 判断是否劝退(§0) |
| 部署平台、有无 CLI | 认平台配置文件;`command -v` 试探平台 CLI | 有 → 实装 `live-status.sh` + `live-config.sh` 并打漂移基线;无 → 留桩,bus-check 会打"未配置"提示 |
| 有无 UI | 前端依赖(package.json 等)/ HTML / 客户端工程 | 无 UI → 删 AGENTS.md §1.5、Gate2 降为规格确认、reviewer 清单删第 5/6 条 |
| 契约边界 | 读跨服务调用代码(HTTP client / API 路由),**自己起草**边界清单 | 草稿填 PROTOCOL.md §1 并标「待确认」;单仓内部接口走共享类型/schema,不进 PROTOCOL |
| 项目名 | README / 包清单 / 目录名 | 填基础模板各处 <占位符> |
| 技术栈事实 | runtime 版本文件、package/lockfile、语言/框架依赖、Dockerfile、CI、数据库/部署配置 | 汇成可追溯的 STACK 草稿卡并标「Draft/待确认」；Node/lockfile/Docker 的可观测精确值同步填 v1 基线块，不确定就保留占位符；默认只放一屏确认，不落文件；用户选择启用后才从 `templates/standards/STACK.md` 生成项目草稿 |

**第二步:只问自查不出来的(通常就剩这三四件):**

| 问题(示例话术) | 答案怎么用 |
|---|---|
| A.「这个项目是几天就收尾,还是要长期做下去?」 | 几天收尾 + 单仓 → **劝退**:单会话直接干,不搭总线,到此为止 |
| B.「现在会同时推进几个互不依赖的功能?先从哪一个开始?」 | 每个功能建一个端到端工作包;默认只开当前优先包,不建立成员/岗位目录 |
| C.「一个功能我会从想清楚、做出来、测好一直跟到可上线;需要时再开几个专业 AI 会话帮忙。就按这个来吗?」 | 默认 → 一个 Builder 端到端拥有工作包,产品/全栈/测试仅作 AI 视角(§2);若要并行,按工作包或物理边界拆,不按人类岗位流水线拆 |
| D.(自查到有 UI 才问)「界面效果谁说了算——有设计工具/设计师出稿,还是做出来你看着提意见?」 | 有稿 → Gate2 走真渲染拍板全流程;无稿 → Gate2 简化为"实现后真渲染给你过目再上线" |

**第三步:一屏确认再动手。** 把「自查结论(带证据)+ 你的回答 + 我按默认拿主意的项 + Gate2/Gate4 是否适用的理由草案 + 可选 STACK/DESIGN 建议」汇成一屏给用户点头——点头即本项目第一次拍板(落 decisions.md,见 8.2 第 5 步),然后才开始生成。无法从事实确认有无 UI/部署时保持 Gate `pending`,不得猜成 `n/a`。

> **可选规范默认不生成。** `standards/` 缺失是合法状态,不增加提问预算;只有用户在同一屏确认中选择启用,才创建相应文件。STACK 首次生成保持 `Status: Draft`,Node/lockfile/Docker 可核对基线和人类声明一起被明确确认后才改 `Confirmed`;不能观测不等于 `n/a`。DESIGN 只在识别到 UI/视觉/交互交付时建议。ADR 只在 `templates/pm/adr/README.md` 的五项判据命中时按需创建,不随骨架批量生成。

### 8.2 生成 checklist(确认过后由 agent 执行)

```
- [ ] 1. 默认只生成基础骨架并排除可选 `standards/` 与 `pm/adr/`。源码候选优先走“`init/adopt --dry-run` → 一屏确认 → apply”受控路径,随后按 `pendingPlaceholders` 填完项目事实；CLI 不可用时,手动等价路径为 `rsync -a --exclude '/standards/' --exclude '/pm/adr/' templates/ <新项目根>/`(会保留隐藏 `.claude/`;若无 rsync,先在新建的空 staging 中 `cp -R templates/.` 后排除可选目录,再拷到目标,不得对非空项目盲删)。**基础交付物的 <占位符> 最终必须按自查+确认结论填好**;`BUILDBEAT.md` 填拷入版本。用户选择启用的 optional 文件单独从模板生成:STACK 先留 `Status: Draft`,DESIGN 仅 UI 项目创建;未启用即不存在
- [ ] 2. meta 仓 git init + 远端;代码子仓各自独立 git;meta 仓 .gitignore 排除子仓目录与一切 *.env(拷 `templates/gitignore.template` 改名 `.gitignore`,替换子仓名)
- [ ] 3. 按问题 B/C 把端到端工作包与所需 AI 视角落根 AGENTS.md §1 路由表(cwd / 可写 / 只读边界);不记录人员组织关系
- [ ] 4. 按自查结果接"线上实况"与漂移基线:实装则 `bash scripts/drift-check.sh --update-baseline` 打首版基线;无平台则留桩;有测试命令则改 `scripts/verify-status.sh` 的 SUITES 接入(工程层验证能力,bus-check 会打;没有测试就留占位符,如实红字)
- [ ] 5. 第一期立项:pm/NOW.md 填当前期与轨道 → 建 <一期>-看板.md,填首个端到端「当前工作包」的 objective/in_scope/terminal_condition、所需 AI 视角与空的决策收件箱 → decisions.md 第一行记「Bootstrap 结论」(自查+确认:工作包边界/轨道/平台/UI/optional 取舍——本项目第一次拍板)。有事实确认本工作包无 UI 时写 ``- Gate2: n/a | 理由: `本工作包无 UI、视觉或交互交付` ``;确认无部署/生产发布交付时写 ``- Gate4: n/a | 理由: `本工作包无部署或生产发布交付` ``;其余保持 `pending`
- [ ] 6. 跑 `bash scripts/bus-check.sh` 自检骨架(输出齐全、无报错),把输出贴给用户过目
- [ ] 7. 装机器闸(**默认,非可选**):meta 仓与各代码子仓逐仓 `cp scripts/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`(紧凑布局下拷贝源为 `pm/scripts/pre-commit.sh`)(gitleaks 拦凭据 + meta 仓 bus-check --strict 拦腐烂/幽灵 hash);`command -v gitleaks` 查无则提醒用户安装,并记入收尾报告
- [ ] 8. (可选)装 Stop hook 自动 push 已 commit 内容(secret 闸已在第 7 步默认上;要更稳可在 push 前再跑一道 `gitleaks dir <仓根>`)
- [ ] 9. 收尾报告一屏:生成了什么 / 按自查+确认做了哪些取舍(含默认值项)/ 当前 Builder 下一步推进哪个工作包、需要时开哪个 AI 视角(参照 指挥台.md)
```

> 各文件「填好之后长什么样」,参照仓库 [example/](example/)(虚构「简账」项目跑完一期的快照)。

## 8.5 接管存量项目(10→N 入口:先摸底、划边界、补验证)

> §8 假设从零起步;公司里大多数项目是**存量**的,两类项目的成本结构相反:0→1 的瓶颈是需求不确定,10→N 的瓶颈是**理解成本 ≫ 编写成本**、改坏的损失 ≫ 改对的收益。收到「给现有项目上 BuildBeat」类请求走本节,别拿 §8 硬套;提问三原则(§8)同样适用。
> 先跑 `node bin/buildbeat.js adopt <项目根> --dry-run --json`:已发布 legacy v0 只给只读计划；当前源码候选在一屏确认后可受控 apply,默认生成紧凑布局并列出/拒绝碰撞。两者都不会判断绞杀者边界、危险区或 L3 是否充分,这些仍按下方仪式核实和拍板；apply 后继续消费 `pendingPlaceholders`,不能把机械落盘当成接管完成。

```
- [ ] 1. 摸底(全自查,不问人):规模(文件/行数)、模块依赖、测试现状(几个测试/能不能跑/跑多久)、
        危险区(被广泛依赖、一改炸全站的模块)、分支状态(落后多少/几个长命分支)、技术栈可观测事实 → 摸底报告一屏给用户。
        报告固定增加「历史债务与接管边界」:已确认债务(带证据)、尚未验证范围、这次接管会治理的新地盘、只维护不重写的老地盘、明确不碰的外部/危险区;不得把存量缺口伪装成本次承诺
- [ ] 2. 划绞杀者边界(用户拍板):「新地盘」(新功能/新模块)走全套总线;「老地盘」只维护、改动一律重轨。
        边界写进根 AGENTS.md §1 与 PROTOCOL——同一项目里两种速度,不是折中成一种。
        只问两个人话问题:「这项目还要长期投入吗?」「哪块最怕改坏?」(危险区,人比代码清楚)
- [ ] 3. 第 0 期 = 补最小验证套件(强制,不做业务需求):核心链路 E2E 起步 + 接 scripts/verify-status.sh。
        没有这一步,证据分级给不出 L3,后面所有 Gate 都在空转
- [ ] 4. 产出分层 AGENTS.md:根一份(路由 + 新旧边界)+ 各业务模块一份(模块地图,给 AI 会话降理解成本)。
        靠标准的「向上合并、就近优先」层叠:改哪个模块只额外装载哪份,根文件因此能保持精简
- [ ] 5. 骨架用**紧凑布局**(§3):`templates/scripts/` 整树拷成 `pm/scripts/`,`指挥台.md` 与 `BUILDBEAT.md` 拷进 `pm/`。
        脚本自定位不用改;要改的是文档里的调用路径——`AGENTS.md`、`pm/NOW.md`、`指挥台.md`、`pm/当期看板.md`、`contracts/PROTOCOL.md`、`ARCHITECTURE.md` 六处,
        改完 `grep -rn 'scripts/' <项目根> --include='*.md'` 复核:只该剩 `pm/scripts/` 与项目自己的 `scripts/`
- [ ] 6. 之后按 §8.2 步骤 2-9 走(骨架/机器闸/第一期立项);一期起步的优先级:补测试 > 机械重构 > 新功能
```

存量项目已有自定义 standards/ADR 时只读摸底并保留项目所有权,不得用上游模板覆盖。项目没有这些文件时仍默认不生成;若用户在接管确认屏选择启用,先用现有配置起草 STACK `Draft`,UI 项目才建议 DESIGN,长期不可逆决定才建 ADR。

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
| [templates/pm/adr/README.md](templates/pm/adr/README.md) / [ADR 模板](templates/pm/adr/ADR-0000-template.md) | 可选 ADR 判据、四态 Status 与替代链;默认不生成 |
| [templates/contracts/PROTOCOL.md](templates/contracts/PROTOCOL.md) | 契约唯一入口骨架 |
| [templates/standards/STACK.md](templates/standards/STACK.md) / [CODE](templates/standards/CODE.md) / [REVIEW](templates/standards/REVIEW.md) / [DESIGN](templates/standards/DESIGN.md) | 可选 project-owned 规范;缺失跳过,Draft 显式待确认,Confirmed STACK 比对 v1 可核对基线,DESIGN 仅 UI 项目 |
| [templates/.claude/agents/reviewer.md](templates/.claude/agents/reviewer.md) | 只读核查门 subagent(`milestone` / `risk-delta` / `closure`) |
| [templates/scripts/bus-check.sh](templates/scripts/bus-check.sh) | 开工护栏(含 live-status 钩子、子仓同步、最近拍板、幽灵 hash 核验、STACK/生产漂移检测集成;`--strict` 机器闸模式) |
| [templates/scripts/pre-commit.sh](templates/scripts/pre-commit.sh) | 红线机器闸五道:gitleaks 拦凭据 / bus-check --strict 拦腐烂·幽灵hash / 多域 status 拦 / 批量 stage 拦 / 契约同步提醒(逐仓拷进 `.git/hooks/pre-commit`) |
| [templates/scripts/drift-check.sh](templates/scripts/drift-check.sh) | 生产漂移检测(env 指纹基线 + 镜像tag↔git 锚定;🔴只存指纹不存值) |
| [templates/scripts/design-preview.sh](templates/scripts/design-preview.sh) | Gate2 真渲染静态服务 |
| [templates/scripts/verify-status.sh](templates/scripts/verify-status.sh) | 工程层验证能力参考实现(SUITES 表 + `--run` 记「上次全绿」标记;L3 证据兜底) |
| [templates/gitignore.template](templates/gitignore.template) | meta 仓 .gitignore 模板(排除子仓与 *.env;拷入后改名) |
| [templates/BUILDBEAT.md](templates/BUILDBEAT.md) | 版本标记 + 布局标记 + 升级路径 + 回灌通道(拷入后填) |

> 5 个 `.sh` 自己定位协调层根(向上找 `pm/NOW.md`),整树搬到 `pm/scripts/` 即得 §3 紧凑布局,脚本本身不用改。同伴脚本(`live-status.sh` / `live-config.sh`)要和它们放同一目录。
>
> 仓库级 CLI 的命令、exit code、schema 1 兼容/三策略 schema 2 文件所有权、机械 upgrade 与手动移除边界见 [docs/CLI.md](docs/CLI.md)。CLI 与 Skill 共用同一协议,但职责不同:Skill 做代码级理解与人 Gate,CLI 只做确定性生命周期机械动作;项目 `uninstall` 命令继续冻结。

## 10. 反模式与实战教训

血泪清单(每条都真实发生过)见 [lessons.md](lessons.md)——SSOT 腐烂、读过期 race、静态稿拍板返工螺旋、域过细收敛史、"当前版本"声明漂移、走查漏独立弹窗、状态条目膨胀、风险清单被新功能挤掉、状态里的幽灵 hash、构建产物混入他人 WIP、平台侧配置漂移、UI 元注释复发等。**搭完骨架后建议通读一遍,大部分零件就是为这些坑而生。**
