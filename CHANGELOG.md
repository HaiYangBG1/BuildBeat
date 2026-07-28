# Changelog

> 本项目吃自己的狗粮(红线④:必更 CHANGELOG)。格式循 Keep a Changelog,倒序。

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
