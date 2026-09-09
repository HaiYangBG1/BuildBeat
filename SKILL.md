---
name: buildbeat
description: BuildBeat —— 面向人和 AI 会话的工程交付工作流,上下文落在项目文件、Git 管理长期事实,支持跨模型、跨工具、跨会话和跨人接续;帮助一个或多个端到端 Builder 用可验证证据闭环需求/功能工作包。运行时 `buildbeat`(由会话调用而非用户手敲):Work 目录 intent/plan digest 绑定接受;隔离 worktree 内 Build→Verify→Review→Fix 自动闭环,停在人的合并决定;overview/inbox/status 回答"到哪了/谁批/卡没卡";发现分诊、预算与成本、infra 故障停人、release-readback 上线回读、observe 生产体检、通知出站、gc 打扫。产品/全栈/测试是可调用的 AI 专业视角,不是人类岗位流水线。当用户说"换会话/删旧会话/继续项目/跨工具接手/同事接手/团队接力",或在 AI 会话里说"当前进度/开工/怎么样了/批准/上线/打扫卫生",或要为新项目搭多会话协作架构、给存量老项目套上协作流程(接管),提到"BuildBeat/Builder/人在回路/多 session 协作/AI 团队流程",或抱怨"多个 AI 会话信息不同步、任务过早结束、审批打断过多、review 过于频繁、验收漏验、返工螺旋"时使用。
---

# BuildBeat —— 面向人和 AI 会话的工程交付协议

> 蒸馏自一个真实跑了多期迭代的实践:一个人协调多个并行 AI 会话,把一个含前端/BFF/多个后端服务/网关/审计的内部产品持续交付。这个案例说明来源,不限定人数;一个 Builder 可用,多个 Builder 也可共享 Git 后按工作包分别闭环。方法论与项目解耦,模板可直接拷贝。

> **会话随时换,项目接着干。** 继续工作所需的上下文落在项目文件中;会话按入口读取同一份目标、决定与证据,由 Loop 推进执行。关闭聊天前补齐未落盘事实;保留活动 Run 的台账与工作树。团队成员按已有权限同步项目文件与候选后可接手,有效的既有决定继续保留;新机器无活动项不代表原机器无 Run。跨成员、跨会话、跨工具和跨机器的具体边界见 [接续指南](docs/v2/guide/11-session-handoff.md)。

## 0. 何时用 / 不用

- **用**:项目要跑多期迭代,或存在多个仓/部署单元/AI 上下文;一个或多个 Builder 需要让需求、契约、决定与证据长期同步。
- **不用**:单仓小任务、一次性脚本、预计一周内收尾的事——直接开一个会话干完,套流程纯属 ceremony(要快就用 `fast` 风险预设,见 §5)。

## 0.5 驾驶手册 —— Skill 是入口,CLI 是它调用的引擎

> 绝大多数人在 Claude Code / Codex / Cursor 这类 AI 会话里使用 BuildBeat,而不是亲手敲 `buildbeat`。所以**这一节是给会话读的**:用户说一句人话,会话按下表调命令、读输出、按格式收口。用户不需要知道任何命令;会话不得把命令名当成对用户的要求。§1–§10 是方法论正文。
> 装载方式:项目根 `AGENTS.md`(模板 [templates/v2/AGENTS.md](templates/v2/AGENTS.md))按所用工具的方式装载——多数 AI 编程工具自动读根目录 `AGENTS.md` 或 `CLAUDE.md`(后者只是一行指针);不自动读的工具由用户开场贴给会话。运行时 `npm install --global @haiyangbg/buildbeat@latest`(预发布才用 `@next`),Node ≥ 20。**没装 CLI 时**本节的"会话背后调什么"一列退化为会话手工维护同名文件(`delivery/work/<ID>/` 与 `decisions.jsonl`):工件协议照用,但自动闭环、隔离 worktree、digest 绑定批准校验、预算与恢复都不存在,会话不得把手工维护表述成等价能力。

> 给用户看的完整版(按项目阶段:未开始 → 立项定方案 → 准备执行 → 执行推进 → 验收合并 → 上线 → 完结换期复盘)在 [docs/v2/guide/00-how-to-talk.md](docs/v2/guide/00-how-to-talk.md);用户问"我该怎么说"时把它给用户,不要复述命令。

### 0.5.1 用户一句话 → 会话做什么

| 用户说 | 会话背后调什么 | 会话回给用户什么 |
|---|---|---|
| 「换会话」「删旧会话」「继续这个项目」「同事接手」 | 按 [接续指南](docs/v2/guide/11-session-handoff.md) 核对项目入口、Work、Git、`overview` / `inbox` / `status`;离开前补齐未落盘事实,接手后区分活动 Run / 中断 / 待批 / 终态 | 「已保存哪些上下文、工作停在哪、下一步」;不把删聊天当删工作树,不重启仍活动的 Run,不伪造或代批决定 |
| 「当前进度」「待办是什么」「X 上线了吗」「离上线还差多远」 | `buildbeat overview --repo .`(每个 Work 的阶段 + 下一步该谁 + `cost:` 已花的 Run/review 轮/等人次数/worker 时长)+ `observe status --repo .` | 每件事一句:走到哪、卡在谁、下一步;**不列命令**;花费超过 intent 止损线的 Work 要主动说「已 N 轮 review / N 小时,继续还是砍」 |
| 「有什么要我拍板」 | `buildbeat inbox --repo .` | 逐项:等什么、证据在哪、推荐 A/B;用户回「批准/拒绝」后会话调 `approve`/`reject` |
| 「开个 Work:〔目标〕」 | 写 `delivery/work/<ID>/intent.md`(为什么做 + **止损线**:最多几个 Run / 几轮 review / 几小时,越线先问人)+ `plan.md`(怎么做)+ `run-config.yaml`(`budgets.reviewRoundsPerWork` 对应止损线);给用户看摘要 | 「看完说接受」;用户说「接受」→ `accept --artifact intent` / `--artifact plan`(digest 绑定) |
| 「开工」「再来一轮」 | 先 `buildbeat doctor --config <run-config.yaml>`(会报本仓 intent/plan 是否存在且已接受、哪条 policy 会把 start 挡在哪步、每步预算),再 `start --config <run-config.yaml> --attempt new`(自动编号 RUN-X-01/02…,自动作废同 Work 的旧等待;**用 nohup/setsid 脱离启动**) | 「已起 RUN-X-02,停在合并决定时会通知/我会告诉你」 |
| 「怎么样了」「卡住了吗」「正常吗」 | `buildbeat status --repo . --run <RUN>` | 一句:在跑第几步、跑了多久、历史通常多久、最后一次输出几分钟前;`STALLED` 就说「疑似卡住,建议停/等」;停在 kind `infra` 就说「worker 环境/后端故障,不是代码问题,恢复后我重跑,预算不扣」 |
| 「批准 RUN-X」「拒绝,原因…」 | 先看 `inbox` 该 Run 等的是哪条 transition,再 `approve --transition <t> --by <用户名>` / `reject --reason`;非终态转换(`enter-fix` / `resume-<step>` / `enter-review`)批准后再 `resume --config <cfg>` 续跑 | 说清批的是哪一步:「放行 fixer,续跑中」/「再跑一次,续跑中」/「合并决定已落,候选 <sha> 具备合并条件;合并/push/部署要你另说」。`SUCCEEDED` 不等于已合并 |
| 会话自己在 Run 的 worktree 里把 finding 修完并提交了(Run 停在 enter-fix / resume-fix) | `resume --config <cfg> --adopt <sha> --by <会话名>`(跳过 fixer,从 verify 续跑;树必须干净、HEAD 必须是该 sha) | 「我已手修并提交 <sha>,验证重跑中」;**不要**为了让 fixer 空跑而 approve enter-fix |
| 「这条 finding 不算,那条接受」 | `findings list` / `findings adjudicate --action dismiss|accept` → `approve --transition enter-fix` | 裁决结果一句 |
| 「上线」「做生产动作」 | 用 `release-readback` 预设 + `riskPreset: release` 开 Run:preflight 回读 → 停 `enter-apply-readback` | 「回读全绿,现在轮到你做〔动作〕;做完说一声」→ 用户说「做完了」→ `approve enter-apply-readback` → 回读+观察 → 停关窗 |
| 「打扫卫生」 | `buildbeat gc --repo .`(先出计划)→ 用户点头 → `--apply true` | 清了几个工作树、留了哪些分支及为什么 |
| 「生产报警」「体检」 | `observe run --config .buildbeat/observe.yaml` → 看 `delivery/observe/intents/` | 草稿一句 + 「fix_now / schedule / dismiss 你选」 |

### 0.5.2 会话必须遵守的读法

- **能实查的不问人**:`overview` / `status` / `inbox` / `metrics` / `observe status` 全是只读,先跑再答;不信文档、不信上游转述。
- **环境故障不是候选缺陷**:超时、崩溃、非 JSON 输出、退出码 75 内核判 `infra` 停人;会话只做两件事——查后端/环境(worker 后端是否 404、端口是否被占、PATH 是否缺工具),恢复后 `approve --transition resume-<step>`;**不要**为了绕过去手写探针循环或起新 Run。verify / 包装脚本发现环境不满足就 `exit 75`。
- **数字要落地**:`status` 给了耗时和历史中位数,回答「正常吗」必须带对比("verify 已 14 分钟,历史中位 6 分钟,最后输出 2 分钟前,还在动");没数据就说没数据。
- **输出里的 `next:` 行是给会话的**,会话据此调命令,不把命令原文丢给用户;用户只需要回「批准 / 拒绝 / 接受 / 做完了 / A / B」。
- **人批三级**(§4.2):`STOP_NOW` 只用于跨发布门 / 扩范围 / 改冻结契约 / 不可逆外部动作 / 接受风险;可逆取舍攒到门前一次批 2～5 个;事实与派生约束自己定。**所有者以后要看见或念出来的名字与参数(域名、服务名、环境名、自停时长、窗口时长)属于门前决策项,不由 worker 顺手定**——真实事故:一个按内部术语起的服务名让所有者连问四轮才改成他听得懂的业务名。
- **环境事实是交付物**:跑出来的"目标机 Python 3.6 / Redis 必须 ≥7 / 端口 8080 被占"写进 `delivery/work/<ID>/env-facts.md`,并尽量转成 run-config `requires:` 的 `probe:` 条目,下窗直接引用,禁止口口相传。
- **收口格式**统一「已做 → 未做 → 下一步」,各一句,证据紧跟事项(§6.4);中间探索不套模板。

### 0.5.3 写 run-config 时的最小样板(会话代写,用户不用看)

```yaml
repo: ../../..
work: WORK-X
# 家族名;start --attempt new 自动编成 RUN-X-01/02…
run: RUN-X
# 从 $(npm root -g)/@haiyangbg/buildbeat/src/v2/presets/software-delivery.yaml 复制到本目录
workflow: workflow.yaml
# fast | standard | controlled | release(配 release-readback 预设)
riskPreset: standard
entry: build
allowedPaths:
  - src
  - tests
# P0/P1 先过人分诊再派 fixer
reviewTriage: required
# 可省;run 配置 > 预设 > 默认。预算耗尽停人时,批准 resume-<step> 即多给一次;
# reviewRoundsPerWork 跨本 Work 所有 Run 累计 review 轮数,超了新 Run 起跑前先问人
budgets:
  maxAttempts:
    review: 2
  reviewRoundsPerWork: 6
# 同树+同命令+同信封已通过就复用证据(标 REUSED)
cache:
  verify: tree
# prompts/<component>-<worker>.md 或 <worker>.md;内核喂给 worker($BUILDBEAT_PROMPT)。冻结信封时加 pin: <meta 提交 sha>
envelope:
  prompts: ../../envelope/prompts
  vars:
    component: auth
requires:
  - command: node
    min: "20"
  - probe: "redis-cli -h $REDIS_HOST ping"
    expect: PONG
    name: redis-reachable
redact:
  - "(token|secret|password|TOKEN|SECRET|PASSWORD)=\\S+"
# worker.sh 与三份 prompt 从 templates/v2/envelope/ 拷到仓级 delivery/envelope/;换工具只改 -- 后面的命令
workers:
  builder:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - builder
      - --
      - codex
      - exec
      - -s
      - workspace-write
  verifier:
    command: bash
    args:
      - -lc
      - npm test
  reviewer:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - reviewer
      - --
      - codex
      - exec
      - -s
      - read-only
  fixer:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - fixer
      - --
      - codex
      - exec
      - -s
      - workspace-write
```

(严格 YAML 子集:只有块列表与块映射,没有行内 `[]` / `{}`,**注释必须独占一行**;上面这份可原样解析,机器验证在 `tests/v2-templates-firstrun.test.js`。**`fixer` 不能省**:没配它,verify 失败或 review 阻断时 Run 停 `WAITING_HUMAN` 等人手修,不会自动修。完整样板 [templates/v2/run-config.example.yaml](templates/v2/run-config.example.yaml),信封 [templates/v2/envelope/](templates/v2/envelope/worker.sh)。)通知通道另放 `.buildbeat/notify.yaml`(URL 只能来自环境变量),见 [docs/v2/guide/07-approval-guide.md](docs/v2/guide/07-approval-guide.md);指南索引 [docs/v2/guide/README.md](docs/v2/guide/README.md)。

**第一次为一个项目写 run-config 时,会话要多问用户一句**:「Run 停下来等你批、跑完、或疑似卡住时,要不要推到钉钉/webhook?给我一个只放在环境变量里的 URL 就行」——试点一直没启用通知,一张合并卡就绪后隔夜等了 9.5 小时。用户说不要就记一句「通知未启用,等待只在 inbox 里」。

worker prompt 里要写清三条环境事实(模板 AGENTS 第 ⑨ 条):沙箱不能监听端口(socket 测试交给 verify)、PATH 只认 POSIX 工具、环境不满足就 `exit 75`。

## 1. 四根支柱(命根子,所有零件都为它们服务)

1. **端到端工作包**:一个 Builder 对一个需求/功能工作包(= Work)的产品判断、实现、测试、合并与发布证据负责;需要隔离时再调用独立 AI 视角(独立 cwd / 上下文 / 写边界)。
2. **人在决定点**:接受 intent/plan、合并决定、上线关窗必须人拍板,**不可自动跨过**;Run 内的 Build→Verify→Review→Fix 由内核自动闭环。人只当"节拍器 + 拍板者",不当信息搬运工。
3. **上下文在项目文件**:会话间不靠人转述,长期事实全部走 Git(`AGENTS.md` → `delivery/work/<ID>/` → 契约 → 决策台账),运行态由内核落台账;开工自取,进度由内核回读而不是会话自述。
4. **证据制完成**:任何工作包声明"完成"必须带 ① Git 回读的候选 commit ② 可核验证据(真实命令的 verify 结果 / 只读 reviewer 的 findings / 线上回读 / 截图)。**无证据 = 没完成。**

> 需求编号可以细,但**执行边界不能跟着编号碎掉**:一个 Builder 同时认领一个可验收的用户级工作包,通常覆盖多个任务 ID / 文档 / commit;同一工作包可调用多个 AI 视角按各自写边界协作。多个 Builder 默认按项目/需求工作包切分,不按人类产品→研发→测试岗位接力。子产物提交、reviewer 返回、Run 停下都只是工作包内事件,不是自动结束会话的理由。

## 2. 工作包所有权与 AI 专业视角

**人类责任按工作包端到端闭环。** 下表是同一 Builder 可调用的默认 AI 视角,用于上下文和写边界隔离;它不是成员目录、岗位分工或审批链。多个 Builder 协作时各自拥有不同工作包,共享契约冲突线下收敛后只落最终事实。

| AI 视角 | 在当前工作包内做什么 | 典型写入边界 |
|---|---|---|
| **产品**(规格/编排) | 拆需求、写 intent/plan、定契约要点、维护决策台账、分诊 finding | `delivery/**`、`pm/decisions.md`、`contracts/` |
| **全栈**(实现,含运维) | 实现 + 改契约 + 部署;可同持多仓但**按仓分别 stage**;Run 内受 `allowedPaths` 机器约束 | 代码仓 |
| **测试**(E2E·走查) | 对精确 candidate 独立核验、视觉回归、设计走查,不合格直接提带图 bug;报告落所属 Work 目录 | `tests/**` + 所属 Work 目录 |

- **审查不是会话视角**:reviewer 是 Run 内置的 fresh-context 只读 worker,输入固定 candidate,输出结构化 findings;任何工作树写入都会被前后快照抓住并按失败落账。会话不另开"审查会话"。
- **设计生成 = 外部工具**(可选):当前工作包的产品视角写 brief → 人喂设计工具 → 稿落 `design/design_N期/`;走查归测试视角。
- **拆 AI 视角的依据是"物理边界(仓/部署单元)+ 是否需要独立核查",不是人类公司职能表。** 实践教训:按职能切出 6 个会话,两个月内被迫合并回 4 个(前端+后端合并、设计+测试合并)——每多一个上下文,编排成本和信息差面积都扩大。合并视角会丢"天然独立核查"防线,由 Run 内置 reviewer + 测试视角独立核两端补回。

## 3. 项目文件布局

```
<项目根>/                          ← 工作区(单仓项目就是代码仓本身;多仓项目是协调层 meta 仓)
├── AGENTS.md                      # 会话路由 + 协作规则 + 红线(开放标准,按工具装载)
├── CLAUDE.md                      # 一行指针 → AGENTS.md(兼容只认此名的工具;🔴 不复制内容)
├── 指挥台.md                       # 给人看的一页:日常六句话、视角开场白
├── BUILDBEAT.md                   # 运行时版本标记 + 升级/回灌说明
├── ARCHITECTURE.md                # 全栈总图(多仓项目;按需读,不自动装载)
├── contracts/PROTOCOL.md          # 跨边界契约唯一入口(多仓项目;单仓可无)
├── standards/                     # 可选:STACK / CODE / REVIEW / DESIGN(Policy 输入工件,默认不生成)
├── pm/decisions.md                # 🔴 平台级拍板台账(全工作区决策单点);可选 pm/adr/
├── delivery/
│   ├── envelope/                  # worker.sh + builder / reviewer / fixer prompt(仓级,进 Git)
│   ├── work/<WORK-ID>/            # intent.md / plan.md / run-config.yaml / workflow.yaml / decisions.jsonl
│   │   └── runs/<RUN-ID>/         #   run-record.json(终态记录,进 Git)
│   └── observe/intents/           # observe 的 Intent 草稿(人分诊,绝不自动执行)
├── .buildbeat/
│   ├── notify.yaml / observe.yaml # 通知通道(URL 只走环境变量)/ 生产体检配置
│   ├── runtime/                   # 🔴 事件台账、锁、日志(本机,不进 Git)
│   └── worktrees/                 # 🔴 每个 Run 的隔离工作树(本机,不进 Git;gc 清)
└── <代码子仓们>/                   # 多仓项目:各自独立 git + 该仓自己的 AGENTS.md(只写本仓局部细节)
```

> 🔴 **装载入口走开放标准 `AGENTS.md`,不绑厂商**(教训 13)。标准语义 = 会话从被编辑文件所在目录**向上收集沿途所有 `AGENTS.md` 合并、离得最近的优先**,所以「根写全局、子仓写局部」是白捡的层叠能力,不用自己发明。只认 `CLAUDE.md` 的工具靠根上一份**一行指针**兼容(内容单点在 `AGENTS.md`,复制过去 = 自造 SSOT 腐烂;也别用符号链接,Windows 上 git 默认 `core.symlinks=false` 会静默退化成文本文件)。同理**不要**引入 gitignore 的本地覆盖文件(如 `AGENTS.override.md`):本文件装的是红线与护栏,允许不进 git 的本地覆盖 = 给绕过护栏开后门,reviewer 与 pre-commit 都看不见。
>
> **不建进度文件、状态文件或看板**:进度由内核从台账与 Git 回读(`overview` / `status`),写进文档的进度从写下那一刻开始腐烂(教训 1)。`.gitignore` 排除 `.buildbeat/runtime/` 与 `.buildbeat/worktrees/`;有 vitest / jest / pytest 的仓另配 exclude `**/.buildbeat/**`,否则主干测试会把旧候选的用例一起跑。

## 4. 协作规则(写进项目根 AGENTS.md,模板已含)

规则原文在 [templates/v2/AGENTS.md](templates/v2/AGENTS.md) §2(十一条),本节只列每条为什么存在:

1. **唯一入口**:活动工作看 `delivery/`(`overview` / `inbox`),不另建进度文件——多处进度必漂移。
2. **契约落盘不喊话(双向)**:跨边界接口先改 `contracts/` 再动代码;收到协议声明独立核查再信;实现中发现契约不够用不得就地消化,停下记契约缺口交产品视角裁决。
3. **交接靠 candidate hash + 台账**:Run 停在合并决定时 candidate 已由 Git 回读固定,`resume --adopt <sha>` 要求树干净且 HEAD 就是该 sha;hash 不得编造。
4. **护栏与不可逆动作**:开工 `overview`;部署/改契约/migration 等不可逆动作前再核一次并走人批;exit 0 不消除 `warning/unverified`。
5. **风险分轨**:Risk Preset 决定人批点(§5);别用牛刀杀鸡,也别借 `fast` 绕过高风险 delta 的独立核查。
6. **核查门**:Run 内 reviewer 只读、结构化 findings;`reviewTriage: required` 时 P0/P1 先过人分诊再派 fixer;review 每 Run 默认 2 轮封顶。**完成 = hash + 可核验证据**;证据分 L0 声称 / L1 `文件:行` / L2 编译·类型 / L3 自动化测试 / L4 线上实测,`standard` 最低 L3,上线必须 L4;`UNVERIFIED` 永不当作通过。
7. **状态单点**:事实进 Run 证据与 Work 记录;进度看 `overview`,度量看 `metrics`。
8. **视觉问题带图对比**:提 UI bug 必附『实现截图 ⟷ 设计稿截图』并排 + 标注差异点。
9. **单点事实**:线上版本只信实查(`observe status` / 部署平台),任何文档不写「当前线上 vX」;每个收敛后的真实决策包只在 `pm/decisions.md` 记一行;历史台账不回改。
10. **真渲染拍板**:有 UI 的拍板对象必须是真渲染证据(可点入口 + 截图 digest),静态稿/规范数值不充当拍板对象;上线前终签同样要含真渲染走查。
11. **所有者可见命名进决策卡**:域名、服务名、环境名、自停时长、窗口时长等所有者以后要看见或念出来的名字与参数,不由 worker 顺手定;进 intent 或门前决策卡(`BATCH_AT_GATE`),给推荐值和理由。

> 十一条之外的一条**元原则:能实查的不问人**——查代码 / 配置 / 部署平台 / `overview` / `status` / `observe status` 能得到的事实,不拿去问用户、不信文档、不信上游转述(§8 Bootstrap 的提问三原则同源)。

### 4.1 任务包协议:不因子任务完成而过早结束

多步骤工作开工时,从用户目标与活动 Work 得到一个**任务包信封**(即 Work 的 intent/plan)。一个工作包可跨视角接力,但每个会话同时只认领一个并遵守自己的写边界;多个独立目标可以并行成多个 Work,不要重新退化成按文件切包。

- `objective`:这轮要交付的用户级结果,不是文件名或动作名。
- `in_scope`:为达成目标可自动继续的关联任务/AI 视角/文件边界。
- `terminal_condition`:只有以下三类——目标带证据完成;遇到必须由人处理的真实阻塞(Run 停 `WAITING_HUMAN` 或 `infra`);用户明确只要阶段性检查点。

需求 ID、验收项和原子 commit 继续保持细粒度,用于追踪、回滚和验证;**它们不自动成为会话结束条件**。只要仍有安全、可逆、在 `in_scope` 内且能推进 `objective` 的工作,会话就继续做。单个文档提交、一次 reviewer 返回、一次 Run 停下都只发中间进展,不得用 final 把接力棒交还给用户。跨视角且当前会话只读时,落盘接力棒并派给有权视角/明确真实阻塞,而不是把"请继续"变成人工调度协议。

### 4.2 审批分层:立即停、门前批、无需批

| 层级 | 什么时候 | 会话动作 |
|---|---|---|
| **STOP_NOW 立即停** | 跨发布门;扩大已批准范围或重开 non-goal;修改**已冻结**对外契约;部署/发布/花费/删除等不可逆外部动作;接受安全或合规风险;权威事实冲突且无法实查 | 停在动作前,一次给出推荐方案、影响和最小问题;获批后继续当前工作包 |
| **BATCH_AT_GATE 门前批** | 冻结前可逆草案选择;已批准目标内的默认值/阈值/失败态归类/实现语义;多个互相关联的产品取舍;所有者可见命名 | 先记入 intent/plan 草稿或门前决策卡,继续不依赖该决定的工作;到人批的转换(accept / merge / release)或约定节奏一次提交**默认 2–5 个真实取舍**(确实只有 1 个就单项),每项带推荐值与后果 |
| **NO_APPROVAL 无需批** | 能实查的事实;已批准信封内的派生约束;文案/归档/证据整理;普通 P2;不改变外部语义的可逆实现细节 | 自主完成并在证据/收口中说明,不把"告知"包装成"请审批" |

判断顺序:先实查 → 再看是否越过 `in_scope`/人批转换/冻结线/不可逆线 → 只有命中 `STOP_NOW` 才立即中断。**人批预算默认每个工作包、每道人批转换只有 1 个 `BATCH_AT_GATE` 请求**;`STOP_NOW` 是越界例外。未决项不得悄悄固化成冻结事实;若它阻塞当前关键路径,把相关真实取舍合并成同一次提问,不要逐条连环问。用户只回答一部分或要求解释时,保持同一决策包编号,补充说明并更新决策卡,不得另造一轮"新审批"。

### 4.3 决策包:验收条件不是 14 个拍板

当前工作包的产品视角先把清单分成两类:① 人必须取舍的**独立决策变量**;② 由已选变量和现有契约推导出的验收约束。只把前者送人批,后者自动写入 plan/契约并随候选一起验收。一次门前默认提交 2–5 个决策变量;用户分轮回答时,未收敛项留在决策卡,收敛后按决策包在 `pm/decisions.md` 记一次,不为"3/14、11/14、14/14"分别制造拍板记录。

## 5. 节奏:风险预设决定人批点

```
写 intent/plan → 人接受(digest 绑定) → Run:Build → Verify → Review → Fix(自动闭环,预算封顶)
→ 停在合并决定(人批;SUCCEEDED ≠ 已合并) → 人合并/push → release-readback 车道:回读 → 人做 → 回读 → 观察 → 人关窗
```

| Risk Preset | 人批点 | 用在 |
|---|---|---|
| `fast` | 仅合并决定 | 小改、可逆、不碰契约 |
| `standard`(默认) | plan 接受 + 合并决定 | 单功能 |
| `controlled` | intent + plan 接受 + 合并决定 + 上线 | 契约变更、大改、不可逆副作用 |
| `release` | 配 `release-readback` 预设:preflight 回读 → 人做 → apply 回读 → 关窗 | 生产动作 |

机器闸(gitleaks pre-commit)、证据制与合并候选一次核查任何预设都不跳;高风险 delta 不得借 `fast` 绕过独立核查。预算(每步 `maxAttempts`、Work 级 `reviewRoundsPerWork`)耗尽是停人不是失败,人批 `resume-<step>` 即多给一次;基础设施故障(超时 / 崩溃 / 非 JSON / exit 75)判 `infra` 停人、不派 fixer、不扣预算。

## 6. 三个仪式(防腐烂的关键,缺了机制必朽)

### 6.1 开工同步

1. 协调层与每个要动的子仓分别 `git pull`;无上游或离线必须明说,不伪称已同步。
2. `buildbeat overview --repo .`:活动 Work、等人的 Run、成本;`inbox` 看有没有等你批的;`observe status` 看生产。
3. 按 `AGENTS.md → 所属 Work 的 intent/plan → contracts → pm/decisions.md → 最近 run-record` 读承重事实。
4. 认领一个端到端工作包,确认 `objective / in_scope / terminal_condition` 与止损线。
5. 核对要动的文件、契约、candidate 与现有证据没有 stale(`overview` 会标 `stale`);不可逆动作前必须再跑一遍开工同步。
6. 只在确认写边界后动手;无法实查的范围记为 `unverified`,不猜。

**每条规则都问「违反了会怎样」;答案只是「靠自觉」时,就该机器化。**

### 6.2 执行中同步

1. 契约/决策先落权威文件,再改共享实现;冻结后的语义 delta 命中 `STOP_NOW`。
2. 原子 commit 可以细,但只在工作包里程碑候选、完成或真实阻塞时向人收口。
3. 不在 Run 跑着的时候改它的候选;要手修就等它停下,在 worktree 里改完提交,`resume --adopt <sha>`。
4. 新事实若使 intent/plan/contracts 失配,在同一变更批次内修回(plan 改了要重新 `accept`);不等收工补旧账。
5. 对无法验证、远端未回读的部分保留 `unverified`,不把局部绿外推为全局通过。

### 6.3 收工同步

1. 确认工作包达到 `terminal_condition`,不把单个子产物当完成。
2. 里程碑候选必须来自一次完整 Run:verify 真跑、reviewer 真核,证据在 run-record 与 `status` 里;会话自己跑的测试只是补充。
3. 回写 contracts / `pm/decisions.md` / intent-plan;已完成工作包的证据就是 run-record + 合并决定,不再另写证据文件。
4. 再跑一次 `overview`,把 warning / unverified 原样写进收口;不用 exit 0 替代覆盖面判断。
5. 确认各仓工作树与 staged 范围;他人 WIP、散落临时文件未收敛时,不声称候选就绪。
6. 一屏收尾(§6.4):交付结果、证据、未验证边界、挂账/真实阻塞、下一步该谁。

### 6.4 域回复格式

每个 AI 视角面向用户收口、交接或回复明确检查点时,统一按「已做 → 未做 → 下一步」输出。这个格式只约束收口事实,不要求中间进展或探索讨论套模板。

```md
## 〔当前视角〕｜✅ 已完成 / 🔄 未完成

### 已做

1. 〔功能或业务结果〕
   - 证据：〔candidate、Run、verify 结果或报告〕

### 未做

1. 〔还没完成或没验证什么〕
   - 原因：〔具体原因〕

### 下一步

- **本视角已完成：** 下一棒是〔哪个视角 / 谁〕，负责〔业务级目标〕。
- **本视角未完成：** 需要〔谁〕提供或确认〔什么〕。
- **无需协助：** 我继续做，暂不交棒。
```

口径:

- `已做`只写功能或业务级结果,不罗列文件和实现细节;证据紧跟它所支持的事项。多项共用同一份证据时,改在列表末尾写一次「共同证据」。
- `未做`必须同时写原因;未验证范围也放这里。没有就写「无」,不把局部验证外推为整体完成。
- `下一步`只保留符合当前状态的一项。下一棒按剩余目标决定,不是固定的产品 → 全栈 → 测试流水线;整个工作包已完成就写「下一棒:无」。
- 本视角未完成但仍能在已批范围内安全推进时,不向用户伪求助;继续做。只有真实阻塞或用户明确要检查点时,才用「需要帮助」或「我继续做,暂不交棒」收口。

### 6.5 读数怎么读

先按级别处理,不要只看退出码。`overview` / `status` / `doctor` 全是只读;它们的读数从台账、Git 主干和真实命令推导,不从会话自述来。

| 读数 | 它证明什么 | 当下动作 |
|---|---|---|
| Run `SUCCEEDED`(停在合并决定) | 候选通过 verify 与 review,具备合并条件 | 人看证据后合并;`SUCCEEDED` ≠ 已合并 |
| `WAITING_HUMAN` kind `approval` / `triage` / `budget` | 内核在等一个具体的人批转换 | `inbox` 看等什么,批哪一步说清哪一步 |
| `WAITING_HUMAN` kind `infra` | worker 环境/后端故障,不是候选缺陷 | 修环境,`approve --transition resume-<step>`;不派 fixer |
| `STALLED` | 无输出超过阈值,只标不杀 | 看最后输出与历史中位数,决定等还是停 |
| `stale`(intent/plan/批准) | 被批准的对象改过 | 重新 `accept` / 重新批,旧批准不复用 |
| 证据 `UNVERIFIED` / `REUSED` | 没核到 / 同树同命令复用 | 前者不得当通过;后者可信但要能说出复用自哪次 |
| `overview` 的 `MERGED` / `RELEASED` / `STOPPED_*` | 从主干、车道、门推导出的阶段 | 按 `next:` 行行动;已合并/已发布不再提未裁决数 |

### 6.6 拍板仪式与换期

当前工作包的产品视角先把验收清单压成真实决策变量并批量呈现;用户拍板后 → 该视角**按收敛决策包**在 `pm/decisions.md` 落一行(决策+回写落点)→ 再分发回写各 SSOT。部分对话进度留在决策卡,不污染永久台账。

换期 = 关闭 Work:候选已合并/已发布后在 `decisions.jsonl` 记关闭,`gc --repo .` 清终态 Run 的工作树,`overview` 不再列它。**同时做回灌一问**:本期踩到 BuildBeat 没覆盖的新坑了吗?有 → 回上游 `lessons.md` 登记。

## 7. 红线(每个会话受约束,单点写进根 AGENTS.md §3)

1. **凭据不入 git、不出本机**:文档只标位置不写值;本地 .env 必须 gitignore + 600 权限;Bootstrap 默认装 gitleaks pre-commit 闸,报警即拦——红线不能只靠自觉(lessons 第 9 条);Worker 默认 env 白名单,`env:` 只注入点名的变量;通知 URL 只能来自环境变量。
2. **不 `git add -A`**:多会话共编,只 stage 自己工作包的具体文件;同持多仓时按仓分别提交。
3. **不未授权部署**、不 force-push、不 `--amend` 已推送历史、不 `--no-verify`。合并决定只表示候选具备合并条件,合并/push/发布是其后的人类动作、逐项授权。
4. **每次部署完必更对应仓 CHANGELOG**(Keep a Changelog,倒序);部署后 `observe run` 一轮。
5. **写者≠审者**:Run 内置只读 reviewer 机器强制;写者转述不构成证据。
6. **事实分层**:代码已确认事实 / 运行时待核事实 / 拟议需求 / 已实现行为,四类严格分开;未实查一律写「待核」。
7. 资源选型 **稳定 > 便宜**;长连接服务部署带优雅下线(PreStop/drain)。

## 8. Bootstrap 新项目(引导式:自查 → 少量提问 → 确认 → 生成)

### 8.0 先认项目形态

收到「用 BuildBeat 开始 / 搭骨架 / 套流程」类请求,**先看目录再说话**:

| 目录里有什么 | 形态 | 走哪条路 |
|---|---|---|
| `delivery/work/` 或 `.buildbeat/` | 已是 BuildBeat 项目 | 不再 Bootstrap;直接 §0.5:`buildbeat overview --repo .` 开场 |
| 什么都没有,且是空仓/新项目 | 0→1 | §8.1 自查与少量提问 → §8.3 生成 checklist |
| 什么都没有,但已有代码 | 10→N 存量项目 | §8.5:先摸底、划边界、补最小验证,再 §8.3 |

自动闭环、隔离 worktree、digest 绑定批准都要 `buildbeat` 在 PATH 上;没装时先装 `npm install --global @haiyangbg/buildbeat@latest`,装不了就明说"只能手工维护工件协议,没有自动闭环"(§0.5 开头),不得把手工路径说成等价能力。

> 🔴 收到「搭骨架 / 用 BuildBeat 起项目」类请求时,流程 = **先自查代码 → 只问查不到的 → 一屏确认 → 生成**;不许直接拷模板留 `<占位符>` 让用户手改,也**不许把看代码就能搞清的事拿去问用户**。
> **提问三原则:① 能从代码/配置查到的不问;② 问就问不懂技术的人也能答的话**(话术不出现"仓/部署单元/契约/CLI"这类词,能给选项就不开放问);**③ 合并一次问完(常规 3 问,查到有 UI 时 +1),不连环追问**。有 AskUserQuestion 类工具就用,没有就在对话里问;用户说「你定 / 随便」就取默认值,并在收尾报告标注。

### 8.1 先自查,后提问

**第一步:自查(带证据)。** 扫一遍项目,下表尽量自己填,每项记下依据(文件路径 / 命令输出):

| 要搞清的事 | 怎么自查 | 结论怎么用 |
|---|---|---|
| 几个仓 / 部署单元 | 找各级 `.git`、Dockerfile / compose / CI / 部署配置 | 仅 1 仓 → 结合问题 A 判断是否劝退(§0);多仓 → 建 `contracts/PROTOCOL.md` 与 `ARCHITECTURE.md` |
| 验证命令 | 测试脚本、CI 配置、Makefile / package scripts | 填 run-config `verifier`;没有可跑的测试 → 第一个 Work 就是补最小验证套件 |
| 用哪个 AI 工具跑 worker | `command -v codex claude aider …`;用户当前会话是什么工具 | 填 run-config 各 worker `--` 后的命令;信封 worker.sh 不用改 |
| 部署平台、有无 CLI | 认平台配置文件;`command -v` 试探平台 CLI | 有 → `.buildbeat/observe.yaml` 加只读探针;无 → 留桩,`observe status` 会如实说未配置 |
| 有无 UI | 前端依赖(package.json 等)/ HTML / 客户端工程 | 无 UI → 删 AGENTS.md §1.5、reviewer prompt 删 UI 项;有 → 拍板对象必须真渲染 |
| 契约边界 | 读跨服务调用代码(HTTP client / API 路由),**自己起草**边界清单 | 草稿填 PROTOCOL.md §1 并标「待确认」;单仓内部接口走共享类型/schema,不进 PROTOCOL |
| 项目名、栈事实 | README / 包清单 / 版本文件 / lockfile / Dockerfile | 填模板各处 <占位符>;可核对的精确值转成 run-config `requires:`;可选 STACK 只在用户启用后生成并保持 `Draft` |

**第二步:只问自查不出来的(通常就剩这三四件):**

| 问题(示例话术) | 答案怎么用 |
|---|---|
| A.「这个项目是几天就收尾,还是要长期做下去?」 | 几天收尾 + 单仓 → **劝退**:单会话直接干,不搭流程,到此为止 |
| B.「现在会同时推进几个互不依赖的功能?先从哪一个开始?」 | 每个功能建一个 Work;默认只开当前优先包,不建立成员/岗位目录 |
| C.「一个功能我会从想清楚、做出来、测好一直跟到可上线;需要时再开几个专业 AI 会话帮忙。就按这个来吗?」 | 默认 → 一个 Builder 端到端拥有工作包,产品/全栈/测试仅作 AI 视角(§2);若要并行,按工作包或物理边界拆,不按人类岗位流水线拆 |
| D.(自查到有 UI 才问)「界面效果谁说了算——有设计工具/设计师出稿,还是做出来你看着提意见?」 | 有稿 → 设计拍板走真渲染全流程;无稿 → 简化为"实现后真渲染给你过目再上线" |
| E.「Run 停下来等你批、跑完或疑似卡住时,要不要推到钉钉/webhook?」(§0.5.3) | 要 → `.buildbeat/notify.yaml`,URL 只走环境变量;不要 → 收尾写明「等待只在 inbox 里」 |

**第三步:一屏确认再动手。** 把「自查结论(带证据)+ 你的回答 + 我按默认拿主意的项 + 风险预设与人批点的理由草案 + 可选 STACK/DESIGN 建议」汇成一屏给用户点头——点头即本项目第一次拍板(落 `pm/decisions.md`),然后才开始生成。无法从事实确认有无 UI/部署时如实写「待核」,不得猜。

> **可选规范默认不生成。** `standards/` 缺失是合法状态,不增加提问预算;只有用户在同一屏确认中选择启用,才创建相应文件。STACK 首次生成保持 `Status: Draft`;DESIGN 只在识别到 UI/视觉/交互交付时建议。ADR 只在 `templates/pm/adr/README.md` 的五项判据命中时按需创建,不随骨架批量生成。

### 8.3 生成 checklist(确认过后由 agent 执行)

```
- [ ] 1. 装载入口:`templates/v2/AGENTS.md` → 项目根 `AGENTS.md`(填项目名、边界、视角路由;单仓项目删多仓相关行),`templates/v2/CLAUDE.md` → `CLAUDE.md`(一行指针,不复制内容),`templates/v2/指挥台.md` → `指挥台.md`,`templates/v2/BUILDBEAT.md` → `BUILDBEAT.md`(填运行时版本与日期)。`templates/gitignore.template` → `.gitignore`(已排除 `.buildbeat/runtime/` 与 `.buildbeat/worktrees/`;有测试框架的项目另配 exclude,见 Workflow 指南)
- [ ] 2. 台账:`templates/pm/decisions.md` → `pm/decisions.md`(记平台级决策包,第一行就是这次 Bootstrap 的确认);多仓才建 `contracts/PROTOCOL.md`(`templates/contracts/`)与 `ARCHITECTURE.md`(`templates/ARCHITECTURE.md`)
- [ ] 3. 信封:`templates/v2/envelope/` 整目录 → `delivery/envelope/`(worker.sh + builder / reviewer / fixer prompt);按项目补 prompt 里的环境事实(§0.5.3 末尾三条)。这一步进 Git,worktree 里才有
- [ ] 4. 第一个 Work:`delivery/work/<WORK-ID>/` 写 `intent.md`(为什么 + 止损线)、`plan.md`;`templates/v2/run-config.example.yaml` → `run-config.yaml`(改 work / run / allowedPaths / verifier / 把 `--` 后的工具命令换成用户实际用的);`$(npm root -g)/@haiyangbg/buildbeat/src/v2/presets/software-delivery.yaml` → `workflow.yaml`
- [ ] 5. 通知(问题 E):要就写 `.buildbeat/notify.yaml`,URL 只能来自环境变量;不要就在收尾说明"等待只在 inbox 里"。有生产环境就再放一份 `.buildbeat/observe.yaml`(只读探针)
- [ ] 6. 机器闸:各代码仓装 gitleaks pre-commit(`command -v gitleaks` 查无则提醒安装,并记入收尾报告);meta 仓 git init + 远端,代码子仓各自独立 git
- [ ] 7. 首跑验收:用户说「接受」→ `accept --artifact intent` / `plan`;`buildbeat doctor --config …` 全段读一遍(intent/plan 接受状态、env 姿态、预算、start 会停在哪);`start --config … --attempt new`(脱离启动)→ 停 `WAITING_HUMAN`;`overview` / `status` 把候选、verify 退出码、findings 读给用户。**这一次 Run 停在合并决定之前,不宣布"接入完成"**
- [ ] 8. 收尾一屏:生成了什么 / 默认拿主意的项 / 首跑停在哪、证据在哪 / 下一步由谁做(合并是人的动作)
```

> 各文件「填好之后长什么样」,参照 [example/](example/README.md)(虚构「简账」项目跑完一个 Work 的快照)。可核对的样例:`tests/v2-templates-firstrun.test.js` 与 `tests/example-firstrun.test.js` 用脚本 worker 代替真实模型,从上面的模板走到合并决定(含一次 verify 失败→fixer→重验)。它证明包内路径、配置、信封、提交机制、reviewer 信封连得上;不证明某个真实模型能完成业务任务。

## 8.5 接管存量项目(10→N 入口:先摸底、划边界、补验证)

> §8 假设从零起步;公司里大多数项目是**存量**的,两类项目的成本结构相反:0→1 的瓶颈是需求不确定,10→N 的瓶颈是**理解成本 ≫ 编写成本**、改坏的损失 ≫ 改对的收益。收到「给现有项目上 BuildBeat」类请求走本节,别拿 §8 硬套;提问三原则(§8)同样适用。

```
- [ ] 1. 摸底(全自查,不问人):规模(文件/行数)、模块依赖、测试现状(几个测试/能不能跑/跑多久)、
        危险区(被广泛依赖、一改炸全站的模块)、分支状态(落后多少/几个长命分支)、技术栈可观测事实 → 摸底报告一屏给用户。
        报告固定增加「历史债务与接管边界」:已确认债务(带证据)、尚未验证范围、这次接管会治理的新地盘、只维护不重写的老地盘、明确不碰的外部/危险区;不得把存量缺口伪装成本次承诺
- [ ] 2. 划绞杀者边界(用户拍板):「新地盘」(新功能/新模块)走全套流程;「老地盘」只维护、改动一律 `controlled`。
        边界写进根 AGENTS.md §1 与 PROTOCOL,并作为 run-config `allowedPaths` 的依据——同一项目里两种速度,不是折中成一种。
        只问两个人话问题:「这项目还要长期投入吗?」「哪块最怕改坏?」(危险区,人比代码清楚)
- [ ] 3. 第 0 期 = 补最小验证套件(强制,不做业务需求):核心链路 E2E 起步,作为 run-config `verifier`。
        没有这一步,证据分级给不出 L3,后面所有人批都在空转
- [ ] 4. 产出分层 AGENTS.md:根一份(路由 + 新旧边界 + 危险区)+ 各业务模块一份(模块地图,给 AI 会话降理解成本)。
        靠标准的「向上合并、就近优先」层叠:改哪个模块只额外装载哪份,根文件因此能保持精简
- [ ] 5. 骨架按 §8.3 步骤 1–3;`delivery/envelope/` 的 builder / fixer prompt 里写明"老地盘只维护、改动一律先问人"
- [ ] 6. 之后按 §8.3 步骤 4–8 走(第一个 Work = 第 3 步的最小验证套件,`allowedPaths` 只放新地盘与 tests)。一期起步的优先级:补测试 > 机械重构 > 新功能
```

存量项目已有自定义 standards/ADR 时只读摸底并保留项目所有权,不得用上游模板覆盖。项目没有这些文件时仍默认不生成;若用户在接管确认屏选择启用,先用现有配置起草 STACK `Draft`,UI 项目才建议 DESIGN,长期不可逆决定才建 ADR。

## 9. 模板索引(templates/,直接拷贝后改占位符)

| 模板 | 用途 |
|---|---|
| [templates/v2/AGENTS.md](templates/v2/AGENTS.md) / [templates/v2/指挥台.md](templates/v2/指挥台.md) | **项目装载入口**:一页流程 + 视角路由 + 十一条规则(含可见命名进决策卡)+ 红线;指挥台是"用户一句话 → 会话调什么"的操作卡 |
| [templates/v2/CLAUDE.md](templates/v2/CLAUDE.md) / [templates/v2/BUILDBEAT.md](templates/v2/BUILDBEAT.md) | 一行指针与版本标记(运行时版本、装载方式、升级 = 升级 CLI、回灌通道) |
| [templates/v2/run-config.example.yaml](templates/v2/run-config.example.yaml) | 可原样解析的 run 配置样板(含 fixer、reviewTriage、budgets、cache、envelope、redact);机器验证见 `tests/v2-templates-firstrun.test.js` |
| [templates/v2/envelope/worker.sh](templates/v2/envelope/worker.sh) + [prompts/](templates/v2/envelope/prompts/builder.md) | worker 包装(工具缺失 exit 75、喂 prompt、写入步机械 commit、只读步落信封)与 builder / reviewer / fixer 三份 prompt;拷到仓级 `delivery/envelope/` |
| [templates/pm/decisions.md](templates/pm/decisions.md) | 平台级决策包台账(全工作区唯一决策单点;Run 级批准由内核落 `decisions.jsonl`) |
| [templates/pm/adr/README.md](templates/pm/adr/README.md) / [ADR 模板](templates/pm/adr/ADR-0000-template.md) | 可选 ADR 判据、四态 Status 与替代链;默认不生成 |
| [templates/contracts/PROTOCOL.md](templates/contracts/PROTOCOL.md) | 跨边界契约唯一入口骨架(多仓项目) |
| [templates/ARCHITECTURE.md](templates/ARCHITECTURE.md) | 全栈总图骨架(架构/基础设施/凭据位置/子项目索引;多仓项目) |
| [templates/standards/STACK.md](templates/standards/STACK.md) / [CODE](templates/standards/CODE.md) / [REVIEW](templates/standards/REVIEW.md) / [DESIGN](templates/standards/DESIGN.md) | 可选 project-owned 规范(Policy 输入工件);缺失跳过,Draft 显式待确认,DESIGN 仅 UI 项目 |
| [templates/gitignore.template](templates/gitignore.template) | 工作区 .gitignore 模板(排除子仓、*.env、`.buildbeat/runtime/`、`.buildbeat/worktrees/`;拷入后改名) |

> 运行时命令面(`accept / start / resume / status / inbox / overview / approve / reject / findings / doctor / preflight / gc / metrics / observe / watch`)见 [docs/v2/guide/README.md](docs/v2/guide/README.md);Skill-only 手工路径 / 运行时 / Claude 插件各自的可用面见 [docs/CAPABILITY-MATRIX.md](docs/CAPABILITY-MATRIX.md)。

## 10. 反模式与实战教训

血泪清单(每条都真实发生过)见 [lessons.md](lessons.md)——SSOT 腐烂、读过期 race、静态稿拍板返工螺旋、视角过细收敛史、"当前版本"声明漂移、走查漏独立弹窗、构建产物混入他人 WIP、平台侧配置漂移、UI 元注释复发、核查门吞掉交付、追踪项当任务边界、等待找不到人、预算是刹车不是墙、基础设施故障当候选失败、台账说的和人看到的不是一回事等。**搭完骨架后建议通读一遍,大部分零件就是为这些坑而生。**
