# Changelog

> 本项目吃自己的狗粮(红线④:必更 CHANGELOG)。格式循 Keep a Changelog,倒序。

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
