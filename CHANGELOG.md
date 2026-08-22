# Changelog

> 本项目吃自己的狗粮(红线④:必更 CHANGELOG)。格式循 Keep a Changelog,倒序。

## v1.13 — 2026-08-22

> 主题:把「细粒度追踪」与「执行/审批粒度」解耦。会话按用户级工作包持续推进,不因子文档/commit/reviewer/status 过早结束;审批分 `STOP_NOW / BATCH_AT_GATE / NO_APPROVAL`,只让真正改变授权、冻结语义或不可逆状态的事项立即打断人。
> **拷出项目升级**:① **只补丁修改**根 `AGENTS.md` 规则③/⑤/⑦/⑨并新增「任务包与人批节奏」(项目自己的域表与扩展规则不得被模板整文件覆盖);② 在当期看板新增「当前工作包 + 决策收件箱」,更新 `pm/decisions.md` 的决策包口径、`pm/changes/README.md` 的草案/冻结分界、`pm/status/README.md` 的按包更新口径与 `指挥台.md`;③ 更新项目 `SOLOBATON.md` 版本并在 `decisions.md` 记一次流程拍板。历史部分决策行/status 不回改,脚本与 reviewer 模板零改动。

- **任务包信封**:多步骤工作明确 `objective / in_scope / terminal_condition`;需求 ID、验收项、原子 commit 继续细分但只作追踪单位。目标范围内仍有安全可逆工作就自动继续;单个文档提交、reviewer 返回、status 回写或普通 P2 不再构成任务结束
- **终止条件收紧**:只允许「用户级目标带证据完成 / 必须由人处理的真实阻塞 / 用户明确只要检查点」三类;从流程上消灭交一个子产物就等用户说“继续”
- **审批三级**:`STOP_NOW` 覆盖跨 Gate、扩范围、已冻结对外语义、不可逆外部动作与风险接受;`BATCH_AT_GATE` 把冻结前可逆选择攒到门前默认一次问 2–5 个(确实只有 1 个就单项);事实、推导约束、归档/status/P2 与不改外部语义的可逆细节走 `NO_APPROVAL`
- **人批预算**:每个工作包、每道 Gate 默认只有 1 个批量审批请求;用户部分回答/要求解释继续沿用同一决策包编号,不重新包装成新审批;不阻塞的工作继续推进
- **决策包而非验收项逐条批**:产品域先区分独立决策变量与派生验收约束;只把前者送人批。分轮回答暂存看板决策收件箱,收敛后 `decisions.md` 只记一行,不再沉淀 `3/14 → 11/14 → 14/14` 式部分状态
- **草案/冻结分界**:`pm/changes/` 允许在已批准工作包内持续收敛草案和补证,到 Gate 一次冻结;冻结前不得冒充 canonical 或进入共享实现,冻结后语义 delta 才触发立即停与回流
- **状态降噪**:原子 commit 保持可回滚,但 status 只在工作包完成、里程碑候选形成或真实阻塞时更新;记录的是交付候选/报告 hash,不是 status 自身 commit(禁止自引用),提交粒度不再决定交互粒度
- 本次回灌来自真实运行数据:任务/状态提交密度、部分决策行和审批式收尾显著高于用户级成果数。解药记入 lessons 第 17 条

## v1.12 — 2026-08-22

> 主题:核查门从「按小任务反复全审」校准为「机器闸常驻 + 高风险 delta 定向核 + 里程碑候选一次全核」,保留写者≠审者,降低流程吞吐损耗。
> **拷出项目升级**:① **只补丁修改**根 `AGENTS.md` 规则⑥与红线 5(项目自己的额外规则/域表不得被模板整文件覆盖);② 整文件替换 `.claude/agents/reviewer.md`;③ 更新 `pm/changes/README.md` 的「实现语义清单 / 候选 hash 集」、当期看板核查门行与 `pm/status/README.md` 的结论摘要口径;④ 在项目 `decisions.md` 记一次流程拍板。历史核查报告不回改,脚本零改动。

- **三层核查分工**:轻量机器闸每次提交,受影响自动化测试按变更批次,里程碑候选跑全量并留证据;任务中只对冻结契约、鉴权/租户/Secret/fail-closed、持久化或不可逆外部副作用等高风险语义做定向 delta 核查;完整四方一致性审查绑定一个里程碑候选 hash 集,同一批只做一次
- **候选 hash 复用**:已核候选 hash 未变且机器证据仍绿,合并前直接复用原结论,不得为「再放心一次」重复全审;候选变化只核 `base..candidate` delta,finding 修复走 `closure`,新增高风险语义走独立 `risk-delta`
- **文件数不再充当风险语义**:`>=N 文件`仍可由 pre-commit 当批量 stage 卫生信号,但归档/改名/status 回写/草稿演进不因文件多自动触发完整 reviewer
- **阻塞口径收敛**:P0/P1 阻塞;P2 默认挂账、不触发一轮完整复核(项目可在立项时显式升格)。首轮报告保留问题原文,后续仅追加 finding closure 表,不复制整段背景
- **实现期不靠记忆**:`pm/changes/` 模板新增「实现语义清单」,只记新增失败态、不可达状态、默认值/阈值、fail-closed 方向等实现期自由度;到里程碑核查一次消费,替代每个微任务各写一份报告
- **reviewer 模板增加三种模式**:`milestone` / `risk-delta` / `closure`,明确输入 hash、审查边界与结论不可外推范围;完整报告默认只在 milestone 产生
- 本次回灌来自真实项目的人机工程反馈:当审查产物开始大于交付产物、同一语义链在任务收尾/合并前/阶段门被重复核,核查门已从防线退化为吞吐瓶颈。解药记入 lessons 第 16 条

## v1.11 — 2026-08-08

> 主题:装载入口去厂商化(回灌教训 15)。**breaking(两个文件改名)**:拷出项目要跟着改名 + 复核全仓引用。
> **拷出项目升级**:① `CLAUDE.md` 改名 `AGENTS.md`(内容原样搬,不改一字)→ 原位新建一行指针 `CLAUDE.md`(拷 `templates/CLAUDE.md`);② `Agent.md` 改名 `ARCHITECTURE.md`;③ 复核残留 `grep -rn 'CLAUDE\.md\|Agent\.md' <项目根> --include='*.md'`,应只剩指针文件自身与 CHANGELOG 历史条目。

- **装载入口从 `CLAUDE.md` 换成开放标准 `AGENTS.md`**:此前只认 `AGENTS.md` 的工具(Codex CLI / Gemini CLI / Aider / Zed 等)完全装载不到总线规则,开工护栏与状态分写在那些会话里**静默失效**——而并行多会话正是本方法论的核心场景,厂商锁在这里杀伤面比单会话大一个量级
- **`CLAUDE.md` 降级为一行指针**(兼容只认此名的工具):🔴 不复制内容(复制 = 自造 lessons 第 1 条 SSOT 腐烂);🔴 不用符号链接(Windows 上 git 默认 `core.symlinks=false`,clone 出来静默退化成文本文件)
- **`Agent.md` → `ARCHITECTURE.md`**:原名与标准 `AGENTS.md` 仅差一个 S、语义却相反(前者按需读 / 后者自动装载),是长期的人机双向误判源
- **白捡标准的层叠语义**:向上收集沿途所有 `AGENTS.md` 合并、就近优先 → §8.5「分层 `AGENTS.md`」不必自己定义优先级,根写全局 / 子仓写局部,根文件因此能保持精简
- **明确拒绝 `AGENTS.override.md` 类本地覆盖**(SKILL §3):装载入口装的是红线与护栏,允许不进 git 的覆盖 = 给绕过护栏开后门,reviewer 与 pre-commit 都看不见
- 顺手修一处既有漂移:SKILL §7 原写「红线……写进 `Agent.md`」,而红线实际单点在装载入口 §3,改为「单点写进根 `AGENTS.md` §3」
- 同步范围:SKILL(§3 布局图 + 装载约定段 / §4 / §7 / §8.1 / §8.2 / §8.5 / §9 模板索引)、双语 README 文件树、`templates/` 与 `example/` 全部交叉引用;**5 个脚本零改动**(本来就不引用这两个文件名)

## v1.10 — 2026-08-08

> 主题:协调层布局可搬迁(治 §8.5 接管存量项目的 `scripts/` 撞车)。**非 breaking:默认布局路径一字未改,已落地项目只换脚本即可。**
> **拷出项目升级**:`scripts/` 下 5 个 `.sh` 整文件替换;`SOLOBATON.md` 加「协调层布局」一行。

- **5 个脚本改为自定位协调层根**:此前一律写死 `ROOT=$(dirname $0)/..`(= 假设"脚本必须在根下一层"),现改为**向上最近的含 `pm/NOW.md` 的目录**(上探 4 层,探不到退回旧假设)。于是 `scripts/` 整树可以原样搬到 `pm/scripts/`,脚本零改动
- **脚本间互调改走 `SDIR`(本脚本目录)**:`verify-status.sh` / `live-status.sh` / `drift-check.sh` / `live-config.sh` 的调用与"未配置"提示、`bus-baseline.json` 与 `.last-green-*` 的落点,全部随脚本目录走——不再写死 `scripts/`。同伴脚本约定为"与 bus-check 同目录"
- **pre-commit 闸② 两种布局都认**:`scripts/bus-check.sh` 与 `pm/scripts/bus-check.sh` 依次探测,提示里回显实际路径;子仓仍按"无 `pm/NOW.md` 即跳过"自动放过
- bus-check 表头加打 `(协调层脚本: <SDIR>/)`:根解析错了(嵌套项目 / 骨架没建)一眼看得见,不静默假绿
- **SKILL §3 新增「布局二选一」表**:默认(根上 `scripts/`,§8 从零起项目用)/ 紧凑(`pm/scripts/` + `pm/指挥台.md` + `pm/SOLOBATON.md`,项目根只多 `pm/` 一个目录,§8.5 接管存量项目用);🔴 一个项目只选一种、路径统一填实,混写 = 自造 SSOT 腐烂;并点明 `CLAUDE.md` 与 `.claude/agents/` 是工具装载约定、永远在根、与布局无关
- **§8.5 增第 5 步**:接管存量项目默认走紧凑布局,列出需改调用路径的 6 个文档 + `grep` 复核命令(存量项目根几乎必有自己的 `scripts/`,协调层混进去会和它的构建/部署脚本搅在一起)
- `SOLOBATON.md` 增「协调层布局」标记行(规则⑨ 单点事实:布局是哪种,单点可查);README 双语同步接管段
- 实测覆盖:两种布局各跑 bus-check(工作区根解析 / 子仓自动发现 / 提示路径回显)、pre-commit 闸②(干净放行 + 腐烂拦截)、`verify-status --run` 标记落点、从子仓 cwd 调用、无骨架兜底

## v1.9 — 2026-08-01

> 评估(第三版)回灌:消灭「常驻红字」(D2)——红字 = 真有事,是腐烂检测全部价值所在;太吵会瞎,和太松会漏同罪。
> **拷出项目升级**:`scripts/pre-commit.sh`、`scripts/bus-check.sh` 整文件替换;新增 `scripts/verify-status.sh`;`.gitignore` 加 `.last-green-*`;`pm/NOW.md` 换期 checklist ① 加 `BUS_ALLOW_BULK` 提示。

- **收窄闸⑤(D2 源头一,真实仓回放 59% 提交误响)**:只看契约**提供方**(controller/endpoint/schema/.proto/routes),排除**消费方**(src/api/ 等客户端调用层、前端页面 router)——消费方是跟随契约不是改契约;匹配/排除模式可用 `BUS_CONTRACT_HINT` / `BUS_CONTRACT_SKIP` 按项目调
- **新增 verify-status.sh 参考实现(D2 源头二,此前是空插座)**:SUITES 表(npm/mvn 样例)+ `--run` 真跑并把「上次全绿时间」记进本地标记文件(`.last-green-*`,不入 git——新机器显示"从未全绿"是诚实的);还是占位符时如实 ⚠️
- **修 D1 残留**:反引号段同时含链接与 hash 时,改为从段内**抠掉** URL/digest 而非整段丢弃,真 hash 不再陪葬
- 换期 checklist ① 注明:归档超 40 文件会触发闸④,该单用 `BUS_ALLOW_BULK=1` 提交(评估指出的人机工程缺口)

## v1.8 — 2026-08-01

> 工业化差距评估(第二版)回灌:修 D1 误报、补齐规则机器化、存量项目入口、版本/回灌通道、证据分级。
> **拷出项目升级**:`scripts/bus-check.sh`、`scripts/pre-commit.sh` 整文件替换;`CLAUDE.md` 规则⑥/⑩ 补丁;新增根 `SOLOBATON.md`;`pm/NOW.md` 换期 checklist 第 4 条;`pm/status/README.md` 反引号约定。

- **修 D1 幽灵 hash 误报**(评估指出,实测确认):提取只认**反引号内** token(status 约定即解析规则)+ 排除 URL/digest 串 + 须同含字母与数字——`defaced`、URL 片段不再误拦提交;代价:纯字母/纯数字 7 位真 hash 良性漏检(约 0.1% / 3.7%)
- bus-check 新增**机器闸自检**:meta 仓与各子仓查 `.git/hooks/pre-commit`(或 core.hooksPath),未装红字——用在跑的闸守新闸
- bus-check 新增**工程层验证能力**段:接 `scripts/verify-status.sh`(每行「套件 命令 上次全绿」),未配置红字提醒「L3 证据无从谈起」
- pre-commit 补三道闸:**多域 status 同 commit 即拦**(规则⑦;换期仪式连同 archive/ 提交或 `BUS_RITUAL=1` 放行)、**暂存 >40 文件即拦**(红线2,像 add -A;`BUS_ALLOW_BULK=1` 放行)、**疑似接口文件未动 PROTOCOL 只提醒不拦**(规则②,契约在 meta 仓、代码在子仓,跨仓无法原子核验);修中文文件名被 git quotepath 转义导致规则匹配不上的 bug
- **证据分五级 L0–L4** 写进规则⑥(标准轨最低 L3=自动化测试过,重轨/上线必须 L4=线上实测;L1 `文件:行` 只作定位不单独作数)
- 新增 **§8.5 接管存量项目**(10→N 入口):摸底(全自查)→ 划绞杀者边界(新地盘全套总线 / 老地盘只维护走重轨)→ **第 0 期强制补最小验证套件** → 分层 CLAUDE.md
- 新增 **templates/SOLOBATON.md 版本标记**:项目根记录所用版本;升级对照 CHANGELOG 各版的「拷出项目升级」行;回灌通道挂进换期仪式(「回灌一问」)
- 元原则「**能实查的不问人**」入 §4 正文与模板 CLAUDE.md(规则⑨/②的推广,与 Bootstrap 提问三原则同源)
- README 双语同步:接管仪式入口、文件树、白话表新增「证据分级 / 接管仪式 / SOLOBATON.md」

## v1.7 — 2026-07-31

> 主题:规则从「靠自觉」到「有机器闸」(外部工业化差距评估回灌第一步:每条规则问一句「违反了会怎样」,答案是「靠自觉」的就机器化)。

- bus-check 新增 **`--strict` 机器闸模式**:确凿检出「协调层腐烂 / 幽灵 hash / 生产漂移」任一即 exit 1;「无法判定/未配置/跳过」不拦,不给流水线添堵;不带参仍恒 exit 0 只当仪表盘
- bus-check 新增**幽灵 hash 核验**:pm/status 里每个 commit hash 逐个对 meta 仓 + 全部子仓 `git cat-file -t`,查无此号红字报警(lessons 第 11 条机器化;此前只能靠接手会话自觉核)
- drift-check 退出码语义化:确凿检出漂移 exit 2(供 --strict 拦截);无漂移/跳过/无法判定仍 exit 0,`--update-baseline` 失败仍 exit 1
- 新增 `templates/scripts/pre-commit.sh` **红线机器闸**:gitleaks 扫暂存区拦凭据(v8.19+ `git` 子命令与旧版 `protect` 自适应)+ meta 仓 bus-check --strict 拦腐烂/幽灵 hash;红线3 已禁 `--no-verify`,闸绕不过
- **gitleaks 从"可选"转默认**:Bootstrap checklist 第 7 步改为默认装机器闸(此前 gitleaks 只作为可选 Stop hook 的前置出现,不装 hook 就整个不出现——正是 lessons 第 10 条的坑);Stop hook 自动 push 顺延为可选第 8 步
- decisions.md 增「**拍板人**」列:单人项目固定写自己;Gate3 合并与 Gate4 上线未必同一人批,审计与将来多人由此可查(模板与 example 沙盘同步)
- README(中英)同步:§2 手动路径补装闸命令、§4 示例输出补幽灵 hash 核验段与拍板人列、§5 机制、§6 文件树、§8 规则④、§9 白话表新增「机器闸 / gitleaks / pre-commit hook」

## v1.6 — 2026-07-28

> 全项目 review 回灌(3 个独立审查代理交叉核查 + 脚本沙盘实测)。

- **修沙盘时间线硬伤**:Gate3 拍板改 06-19(此前 06-18,早于 P1 发现日,因果倒置);回写落点 ④→⑤;P1 归属统一为"走查发现";README 双语示例块同步
- **修 drift-check 基线保护**:`--update-baseline` 任一应用查询失败即拒绝落盘并 exit 1(此前平台 CLI 全失败会用空基线**覆盖好基线**,漂移信号永久丢失);检测模式全失败改报"无法判定"而非谎报"无漂移";APPS 数组清空不再 unbound variable 崩
- **bus-check 检测诚实化**:NOW 缺失/占位符时如实报"无法判定/跳过"而非打假 ✅;新增当期看板坏指针告警;meta 仓仅本地领先时提示 git push(此前误导性提示 pull)
- 中文 README:去掉作者本机路径前缀 `AI底座/`;首句"活塞"歧义改"活儿都塞";示例块与脚本实际输出逐字对齐;§6 树补 gitignore.template(中英同)
- 英文版:SSOT 统一为 single source of truth 并展开缩写;补漏译(开工四步行/P1 bug 名/或无上游/若干从句);5 处措辞修正(主语错位/It.2 等)
- 口径统一:SKILL"两个后端"改"多个"(与 README 一致);SKILL §6 归档清单补"需求";lessons 第 4 条解药行随域改名;模板/沙盘内 lessons 引用注明"solobaton lessons"出处(拷入新项目后不再悬空)

## v1.5 — 2026-07-28

- bus-check 新增**协调层腐烂检测**:NOW 长肥(>40 行)/ 非当期看板滞留 pm/ / status 超长(>60 行),开工红字报警;阈值 `BUS_NOW_MAX` / `BUS_STATUS_MAX` 可调(仪式没有护栏 = 没有仪式)
- 新增期产物归档约定:走查图 / E2E 报告等证据**生成时即写** `pm/archive/<期>/evidence/`,换期零搬运;换期 checklist 增第 ④ 条(核对证据归位、无散落临时文件)
- README 双语同步机制说明与 bus-check 示例;README 底部不再写"当前 vX"(版本这个事实也只留 CHANGELOG 一处)

## v1.4 — 2026-07-26

- 新增 `example/` 教学沙盘:虚构「简账」记账应用跑完一期的全套总线文件快照(内容全部虚构脱敏,hash 为示意值)
- 新增英文版 README(`README.en.md`),中英 README 顶部互链
- README §4 新增 bus-check 示例输出(节选);版本史迁出至本文件
- templates 新增 `gitignore.template`(meta 仓排除子仓与 `*.env`;文件名不带点,避开 cp 丢点文件的坑)
- Bootstrap 第 7 步补 secret 扫描示例命令(gitleaks)
- bus-check.sh 健壮性:无 perl 时降级为不截断输出;新增 `BUS_CHECK_NO_FETCH=1` 离线/弱网跳过 fetch
- GitHub 仓库补 topics(claude-code / ai-agents / multi-agent 等)

## v1.3 — 2026-07-26

- Bootstrap 改引导式:先自查代码(仓数/平台/UI/契约边界),只问 3–4 个非技术问题,一屏确认再生成,占位符全部填好
- 三域默认名改为 产品 / 全栈(含运维)/ 测试;访谈新增「分工用默认还是自定义」一问
- README 简介重构:先说解决什么问题(含单会话困局),再说怎么用,附记账应用实例(含首次对话设定角色);新增 §9 名词白话表
- 修复:快速上手 cp 命令 `*` 不匹配点文件会丢 `.claude/agents/reviewer.md`,改为 `cp -R templates/.`
- 修复:README mermaid 在 GitHub 渲染失败(标签全加引号 + `<br/>` 闭合)
- drift-check 指纹注释补诚实边界:低熵值可被字典猜出,基线按半敏感文件对待

## v1.2 — 2026-07-04

- 回灌教训 14(UI 元注释复发);新增 CLAUDE.md §1.5「界面零元注释」红线;reviewer 审查清单第 6 条

## v1.1 — 2026-07-02

- 回灌三周实战:生产漂移检测机制(drift-check.sh:env 指纹基线 + 镜像 tag↔git 锚定)+ 教训 11–13

## v1 — 2026-06-10

- 首次蒸馏:方法论主体(四支柱 / 域模型 / 十条规则 / 四 Gate + 三轨 / 三仪式 / 红线)+ 模板脚手架 + 教训 1–10
