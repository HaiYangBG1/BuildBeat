# BuildBeat 方法论 · Bootstrap 新项目与接管存量项目（原 §8、§8.5）

> 从 [`SKILL.md`](../../../SKILL.md) 移出的正文，原文与原节号不变，只调整了相对链接；入口、驾驶手册与红线摘要仍在 `SKILL.md`。

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
- [ ] 7. 首跑验收:用户说「接受」→ `accept --artifact intent,plan`(一次接受两份);`buildbeat doctor --config …` 全段读一遍(intent/plan 接受状态、env 姿态、预算、start 会停在哪);`start --config … --attempt new`(脱离启动)→ 停 `WAITING_HUMAN`;`overview` / `status` 把候选、verify 退出码、findings 读给用户。**这一次 Run 停在合并决定之前,不宣布"接入完成"**
- [ ] 8. 收尾一屏:生成了什么 / 默认拿主意的项 / 首跑停在哪、证据在哪 / 下一步由谁做(合并是人的动作)
```

> 各文件「填好之后长什么样」,参照 [example/](../../../example/README.md)(虚构「简账」项目跑完一个 Work 的快照)。可核对的样例:`tests/v2-templates-firstrun.test.js` 与 `tests/example-firstrun.test.js` 用脚本 worker 代替真实模型,从上面的模板走到合并决定(含一次 verify 失败→fixer→重验)。它证明包内路径、配置、信封、提交机制、reviewer 信封连得上;不证明某个真实模型能完成业务任务。

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
