# WORK-DELIVERY-BINARIES 结果

`delivery/` 下的截图、压缩包和日志不再进 Git：两份 `gitignore.template` 默认忽略这几类文件，`delivery/` 本身照旧进 Git；`accept` 和 `check` 发现工作文件夹里有下一次提交会带进 Git 的这类文件或 256 KB 以上的文件，打印一行提醒，列出文件和大小，只提醒不拦。快速开始、只用 Skill 和项目文件的指南、Skill、README 都写明了这一条。
候选 5d0cf89 经 RUN-DELIVERY-BINARIES-01 验证一次通过、codex 只读审查第 1 轮 0 条，所有者批准（D-RUN-DELIVERY-BINARIES-01-2）后以 5500454 合入工作分支，经 PR #106 以 merge commit ede8189 进 main（v2 已快进）；未发版。

## 定了什么

- 开工前四项由会话按推荐接受（A-WORK-DELIVERY-BINARIES-1），依据是所有者说的「做进 BuildBeat」；所有者没有逐项看 work.md，批准前看过提醒原文。四项是：忽略 png、jpg、jpeg、gif、webp、zip、tgz、gz、log；大小门槛 256 KB；只在 `accept` 和 `check` 提醒、不拦；只看还没进 Git 也没被忽略的文件。
- 已经进了 Git 的文件不提醒：它们已在历史里，删掉也不会让仓库变小，老工作每次 `check` 都提醒只会是噪音。
- 运行时自己的 `requireScreenshot` 截图存在 `.buildbeat/runtime/`，不经过 `delivery/`，新规则不影响截图证据。
- 在试点工作区 185 项工作上只读试跑，0 条提醒，没有误报。

## 剩下的

- 发版：等所有者决定；提醒要到发版后的运行时才有。
- 已经在用 BuildBeat 的项目要自己把新规则拷进 `.gitignore`：模板只在接入时复制，发版不会改项目文件。试点工作区已在迁移时手工加好。

## 写进项目的

- 无：规则和提醒写在模板、指南、Skill、README 和 CHANGELOG 里，都随候选一起进了主干；没有另外需要写回的项目文档。
