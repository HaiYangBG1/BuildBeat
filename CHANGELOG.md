# Changelog

> 本项目吃自己的狗粮(红线④:必更 CHANGELOG)。格式循 Keep a Changelog,倒序。

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
