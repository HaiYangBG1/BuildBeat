---
name: solobaton
description: Solobaton —— 人在回路·Builder 协作总线:一个 Builder 指挥多个并行 AI 会话交付中大型项目的方法论 + 可复制脚手架(会话路由/文件总线/四 Gate/三轨/核查门/决策台账/换期压缩仪式/开工护栏脚本/引导式 Bootstrap:自查代码+少量提问)。当用户要为新的中大型项目搭多会话协作架构、提到"Solobaton/协作总线/Builder/人在回路/多 session 协作/AI 团队流程/项目骨架 bootstrap",或抱怨"多个 AI 会话信息不同步、验收漏验、文档腐烂、返工螺旋"时使用。
---

# Solobaton —— 一个 Builder + N 个 AI 会话交付中大型项目(Builder 协作总线)

> 蒸馏自一个真实跑了多期迭代的实践:单人 + 4 个并行 AI 会话,把一个含前端/BFF/两个后端服务/网关/审计的内部产品从零迭代上线 30+ 次。方法论与项目解耦,模板可直接拷贝。

## 0. 何时用 / 不用

- **用**:项目 ≥ 2 个仓或部署单元、要跑多期迭代、一个人同时扮演 PM/开发/测试/运维、AI 会话之间需要交接。
- **不用**:单仓小任务、一次性脚本、预计一周内收尾的事——直接开一个会话干完,上总线纯属 ceremony(对应 §5 快轨思想)。

## 1. 四根支柱(命根子,所有零件都为它们服务)

1. **真多会话隔离**:每个"域"= 一个独立 AI 会话(独立 cwd / 独立上下文 / 只写自己的文件)。天然抗 context rot,天然实现"写者≠审者"。
2. **人在 Gate**:规格、设计、合并、上线四个决策点必须人拍板,**不可自动跨过**。人只当"节拍器 + 拍板者",不当信息搬运工。
3. **文件总线**:会话间不靠人转述,信息全部走 repo 文件(指针 → 看板 → 契约 → 状态),开工自取。
4. **证据制完成**:任何域声明"完成"必须带 ① commit hash ② 可核验证据(测试命令 / `文件:行` / 线上实测 / 截图)。**无证据 = 没完成。**

## 2. 域模型(宁少勿多,从 3 个起步)

| 域 | 干什么 | 写哪 |
|---|---|---|
| **产品**(记账/编排) | 拆需求、定契约要点、维护看板与决策台账、派核查门 | `pm/**` |
| **全栈**(实现,含运维) | 实现 + 改契约 + 部署;可同持多仓但**按仓分别 stage** | 代码仓 + `contracts/` |
| **测试**(E2E·走查) | 黑盒 E2E + 视觉回归 + 设计走查,不合格直接提带图 bug | `tests/**` + 证据产物(落 `pm/archive/<期>/evidence/`) |

- **reviewer = 只读 subagent**(不是常驻会话):核「实现↔设计↔契约↔需求」四方一致,模板见 [templates/.claude/agents/reviewer.md](templates/.claude/agents/reviewer.md)。
- **设计生成 = 外部工具**(可选):产品域写 brief → 人喂设计工具 → 稿落 `design/design_N期/`;走查归测试域。
- **切域依据是"物理边界(仓/部署单元)+ 是否需要独立核查",不是人类公司职能表。** 实践教训:按职能切出 6 个域,两个月内被迫合并回 4 个(前端+后端合并、设计+测试合并)——每多一个域,人的编排成本和信息差面积都翻倍。**合并会丢"天然独立核查"防线,必须用补偿控制顶上**(全栈域动契约 → 必派 reviewer + 测试域独立核两端)。

## 3. 文件总线布局

```
<项目根>/                      ← meta 仓(协调层,独立 git;代码各在自己的子仓)
├── CLAUDE.md                  # 会话路由 + 总线规则(每个会话自动装载)
├── Agent.md                   # 全栈总图:架构/基础设施/凭据位置(只标不写值)/子项目索引
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
├── scripts/bus-check.sh       # 开工护栏(见模板)
├── scripts/drift-check.sh     # 生产漂移检测:平台侧 env 指纹+镜像tag↔git vs 基线(见模板)
├── scripts/design-preview.sh  # Gate2 真渲染(见模板)
└── <代码子仓们>/               # 各自独立 git + AGENTS.md/CLAUDE.md + CHANGELOG.md
```

## 4. 总线十条规则(写进项目 CLAUDE.md,模板已含)

1. **唯一看板指针**:入口永远是 `pm/NOW.md` → 当期看板;换期只改 NOW 一处,**看板文件名不得写死进任何别的文档**。
2. **契约落盘不喊话**:跨边界接口先改 `contracts/PROTOCOL.md` 再动代码;收到对方的协议声明**独立核查再信**(实测/读代码/查部署配置),不照单全收。
3. **交接靠 commit + 落盘**:做完 → 状态行带 hash,下游读 repo 即知进度,不靠人转述。
4. **开工护栏**:任意会话开工先跑 `bash scripts/bus-check.sh` + `git pull`;**部署/改契约/migration 等不可逆动作前再跑一次**(治"会话中途决策已变还按旧信息干")。
5. **三轨制**:快轨(小改:直接改+核查门)/ 标准轨(单功能:需求→设计→实现→验收)/ 重轨(契约变更/大改:+变更提案+多 agent 评审)。NOW 标本期轨道,别用牛刀杀鸡。
6. **核查门**:验收/合并前派只读 reviewer 并行核「实现↔设计↔契约↔需求」;完成 = hash + 可核验证据。
7. **变更提案 + 状态分写**:跨域变更走 `pm/changes/` delta 提案;各域只写 `pm/status/<域>.md`,别人只读——物理消灭"同文件互踩"。
8. **视觉问题带图**:提 UI bug / 判设计符合性必附「实现截图 ⟷ 设计稿截图」并排对比,纯文字描述不算证据。
9. **单点事实**:① 线上版本只信 bus-check 实查(任何文档不写"当前线上 vX",契约快照版本仅 PROTOCOL 头部一处)② 拍板第一动作 = `decisions.md` 追加一行+回写落点(欠账可见)③ 换期必跑压缩仪式。
10. **Gate2 真渲染拍板**:设计拍板对象必须是**真渲染可点原型**(`bash scripts/design-preview.sh <期>`),静态稿/截图不充当拍板对象;设计 brief 必须要求"单 HTML 可渲染入口 + 关键流可点"。**终签同样要含真渲染走查**(spec 数值对 ≠ 渲染对)。

## 5. 节奏:四 Gate + 三轨

```
Gate1 规格(人批) → Gate2 设计(人对着真渲染原型批) → 实现+核查门 → Gate3 合并(人批,reviewer 批准≠合并)
→ Gate4 上线(人批) → 测试域复核 → 产品域收尾记账
```
快轨可跳 Gate1/2,但核查门和证据制**任何轨都不跳**。

## 6. 三个仪式(防腐烂的关键,缺了机制必朽)

- **开工仪式**:bus-check(打印 当前期/契约/最近拍板/各域状态/子仓同步/线上实况/生产漂移)→ git pull → 确认要动的不 stale。
- **拍板仪式**:用户每拍一锤 → 产品域**先**在 `decisions.md` 落一行(决策+回写落点)→ 再分发回写各 SSOT。
- **换期压缩仪式**:当期 看板/todo/验收清单 `git mv` 进 `pm/archive/<期>/`;status 全文快照入 archive、live 文件截断只留「基线+最近一条+归档指针」;NOW 流水清零;核对证据产物已在 `archive/<期>/evidence/`、无散落临时文件。**NOW 长肥 = 腐烂开端**——bus-check 的「协调层腐烂检测」会在 NOW 长肥 / 旧看板滞留 / status 超长时开工红字报警(仪式没有护栏 = 没有仪式)。

## 7. 红线(每个会话受约束,写进 Agent.md)

1. **凭据不入 git、不出本机**:文档只标位置不写值;本地 .env 必须 gitignore + 600 权限。
2. **不 `git add -A`**:多会话共编,只 stage 自己域的具体文件;同持多仓时按仓分别提交。
3. **不未授权部署**、不 force-push、不 `--amend`、不 `--no-verify`。
4. **每次部署完必更对应仓 CHANGELOG**(Keep a Changelog,倒序)。
5. **写者≠审者**:动契约/验收必过独立 reviewer(subagent 还原这道防线)。
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
| 有无 UI | 前端依赖(package.json 等)/ HTML / 客户端工程 | 无 UI → 删 CLAUDE.md §1.5、Gate2 降为规格确认、reviewer 清单删第 5/6 条 |
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
- [ ] 1. 拷贝 templates/ 整树(`cp -R templates/. <新项目根>/`,`/.` 结尾才带上隐藏的 `.claude/`);**全部 <占位符> 按自查+确认结论填好,交付物里不得残留任何 <占位符>**;按有无 UI 删/留相关段落
- [ ] 2. meta 仓 git init + 远端;代码子仓各自独立 git;meta 仓 .gitignore 排除子仓目录与一切 *.env(拷 `templates/gitignore.template` 改名 `.gitignore`,替换子仓名)
- [ ] 3. 域表按问题 B/C 落 CLAUDE.md §1 路由表(cwd / 可写 / 只读边界)
- [ ] 4. 按自查结果接"线上实况"与漂移基线:实装则 `bash scripts/drift-check.sh --update-baseline` 打首版基线;无平台则留桩
- [ ] 5. 第一期立项:pm/NOW.md 填当前期与轨道 → 建 <一期>-看板.md → decisions.md 第一行记「Bootstrap 结论」(自查+确认:域表/轨道/平台/UI 取舍——本项目第一次拍板)
- [ ] 6. 跑 `bash scripts/bus-check.sh` 自检骨架(输出齐全、无报错),把输出贴给用户过目
- [ ] 7. (可选)装 Stop hook 自动 push 已 commit 内容;装前务必先加 secret 扫描一道闸(最小示例:push 前跑 `gitleaks dir <仓根>`,报警即拦)
- [ ] 8. 收尾报告一屏:生成了什么 / 按自查+确认做了哪些取舍(含默认值项)/ 下一步开哪个会话、说哪句话(参照 指挥台.md)
```

> 各文件「填好之后长什么样」,参照仓库 [example/](example/)(虚构「简账」项目跑完一期的快照)。

## 9. 模板索引(templates/,直接拷贝后改占位符)

| 模板 | 用途 |
|---|---|
| [templates/CLAUDE.md](templates/CLAUDE.md) | 工作区路由 + 十条规则(每会话自动装载) |
| [templates/Agent.md](templates/Agent.md) | 全栈总图骨架(架构/基础设施/凭据位置/红线) |
| [templates/指挥台.md](templates/指挥台.md) | 给人看的一页操作卡 |
| [templates/pm/NOW.md](templates/pm/NOW.md) | 薄指针 + 换期压缩仪式 checklist |
| [templates/pm/当期看板.md](templates/pm/当期看板.md) | 阶段门/分工/挂账骨架 |
| [templates/pm/decisions.md](templates/pm/decisions.md) | 拍板台账 |
| [templates/pm/status/README.md](templates/pm/status/README.md) | 状态分写约定 + 域文件模板 |
| [templates/pm/changes/README.md](templates/pm/changes/README.md) | 重轨变更 delta 提案流程 + 模板 |
| [templates/contracts/PROTOCOL.md](templates/contracts/PROTOCOL.md) | 契约唯一入口骨架 |
| [templates/.claude/agents/reviewer.md](templates/.claude/agents/reviewer.md) | 只读核查门 subagent |
| [templates/scripts/bus-check.sh](templates/scripts/bus-check.sh) | 开工护栏(含 live-status 钩子、子仓同步、最近拍板、漂移检测集成) |
| [templates/scripts/drift-check.sh](templates/scripts/drift-check.sh) | 生产漂移检测(env 指纹基线 + 镜像tag↔git 锚定;🔴只存指纹不存值) |
| [templates/scripts/design-preview.sh](templates/scripts/design-preview.sh) | Gate2 真渲染静态服务 |
| [templates/gitignore.template](templates/gitignore.template) | meta 仓 .gitignore 模板(排除子仓与 *.env;拷入后改名) |

## 10. 反模式与实战教训

血泪清单(每条都真实发生过)见 [lessons.md](lessons.md)——SSOT 腐烂、读过期 race、静态稿拍板返工螺旋、域过细收敛史、"当前版本"声明漂移、走查漏独立弹窗、状态条目膨胀、风险清单被新功能挤掉、状态里的幽灵 hash、构建产物混入他人 WIP、平台侧配置漂移、UI 元注释复发等。**搭完骨架后建议通读一遍,大部分零件就是为这些坑而生。**
