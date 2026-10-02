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

> 绝大多数人在 Claude Code / Codex / Cursor 这类 AI 会话里使用 BuildBeat,而不是亲手敲 `buildbeat`。所以**这一节是给会话读的**:用户说一句人话,会话按下表调命令、读输出、按格式收口。用户不需要知道任何命令;会话不得把命令名当成对用户的要求。方法论正文(§1–§10)按需读,见文末「按需再读」。
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
| 「批准 RUN-X」「拒绝,原因…」 | 先看 `inbox` 该 Run 等的是哪条 transition,再 `approve --transition <t> --by <用户名>` / `reject --reason`;非终态转换(`enter-fix` / `resume-<step>` / `enter-review`)批准后再 `resume --config <cfg>` 续跑;用 `--attempt new` 自动编号时会选择该家族唯一未终态 Run，也可 `--run <RUN-ID>` 指定;多个候选或没有未终态 Run 时按报错处理 | 说清批的是哪一步:「放行 fixer,续跑中」/「再跑一次,续跑中」/「合并决定已落,候选 <sha> 具备合并条件;合并/push/部署要你另说」。`SUCCEEDED` 不等于已合并 |
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
# off = P0/P1 直接派 fixer;高风险项目改 required,每轮先停人分诊
reviewTriage: off
# 可省;run 配置 > 预设 > 默认。非只读步成功不扣次数;review 仍按轮计费。
# review 不收敛(修过的 finding 又出现/阻断数变多)才在 enter-fix 停人;
# reviewRoundsPerWork(默认 6)是 review 轮数唯一上限,跨本 Work 所有 Run 累计,到顶一次批准修复、重验、再审
budgets:
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

(严格 YAML 子集:只有块列表与块映射,行内只允许空的 `[]` / `{}`,列表项可与键同缩进,**注释必须独占一行**;上面这份可原样解析,机器验证在 `tests/v2-templates-firstrun.test.js`。**`fixer` 不能省**:没配它,verify 失败或 review 阻断时 Run 停 `WAITING_HUMAN` 等人手修,不会自动修。完整样板 [templates/v2/run-config.example.yaml](templates/v2/run-config.example.yaml),信封 [templates/v2/envelope/](templates/v2/envelope/worker.sh)。)通知通道另放 `.buildbeat/notify.yaml`(URL 只能来自环境变量),见 [docs/v2/guide/07-approval-guide.md](docs/v2/guide/07-approval-guide.md);指南索引 [docs/v2/guide/README.md](docs/v2/guide/README.md)。

**第一次为一个项目写 run-config 时,会话要多问用户一句**:「Run 停下来等你批、跑完、或疑似卡住时,要不要推到钉钉/webhook?给我一个只放在环境变量里的 URL 就行」——试点一直没启用通知,一张合并卡就绪后隔夜等了 9.5 小时。用户说不要就记一句「通知未启用,等待只在 inbox 里」。

worker prompt 里要写清三条环境事实(模板 AGENTS 第 ⑨ 条):沙箱不能监听端口(socket 测试交给 verify)、PATH 只认 POSIX 工具、环境不满足就 `exit 75`。

## 红线摘要(全文与理由见 [05-red-lines.md](docs/v2/skill/05-red-lines.md),单点写进项目根 AGENTS.md §3)

1. **凭据不入 git、不出本机**:文档只标位置不写值,默认装 gitleaks pre-commit 闸;worker 只拿点名的环境变量,通知 URL 只走环境变量。
2. **不 `git add -A`**:只 stage 自己工作包的具体文件,多仓按仓分别提交。
3. **不未授权部署**、不 force-push、不 `--amend` 已推送历史、不 `--no-verify`;合并/push/发布是人的动作,逐项授权。
4. **每次部署完必更对应仓 CHANGELOG**,部署后 `observe run` 一轮。
5. **写者≠审者**:Run 内置只读 reviewer 机器强制,写者转述不构成证据。
6. **事实分层**:已确认 / 待核 / 拟议 / 已实现四类分开,未实查一律写「待核」。
7. 资源选型 **稳定 > 便宜**;长连接服务部署带优雅下线。

## 按需再读:方法论正文(原 §1–§10)

驾驶手册里提到的 `§N` 都在下列文件里,原节号不变。遇到对应场景再读,不必每次装载。

| 原节号 | 什么时候读 | 文件 |
|---|---|---|
| §1 四根支柱、§2 工作包与 AI 视角 | 解释 BuildBeat 为什么这样设计、决定要不要拆视角 | [01-principles.md](docs/v2/skill/01-principles.md) |
| §3 项目文件布局 | 新建或核对项目目录、`.gitignore`、装载入口 | [02-project-layout.md](docs/v2/skill/02-project-layout.md) |
| §4 协作规则、§4.1 任务包、§4.2 审批分层、§4.3 决策包 | 判断一件事要不要问人、怎么批量问、会话何时可以结束 | [03-collaboration-rules.md](docs/v2/skill/03-collaboration-rules.md) |
| §5 风险预设、§6 三个仪式、§6.4 收口格式、§6.5 读数、§6.6 拍板与换期 | 开工 / 收工 / 收口 / 解读 `overview`、`status` 读数 / 换期 | [04-rhythm-and-rituals.md](docs/v2/skill/04-rhythm-and-rituals.md) |
| §7 红线全文 | 任何涉及凭据、提交、部署、审查边界的动作之前 | [05-red-lines.md](docs/v2/skill/05-red-lines.md) |
| §8 Bootstrap 新项目、§8.5 接管存量项目 | 用户要「搭骨架 / 给项目套上 BuildBeat / 接管老项目」 | [06-bootstrap-and-takeover.md](docs/v2/skill/06-bootstrap-and-takeover.md) |
| §9 模板索引、§10 实战教训 | 找模板、查某条机制背后的事故([lessons.md](lessons.md)) | [07-templates-and-lessons.md](docs/v2/skill/07-templates-and-lessons.md) |
