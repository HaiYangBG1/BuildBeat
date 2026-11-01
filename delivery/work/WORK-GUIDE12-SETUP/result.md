# WORK-GUIDE12-SETUP 结果

指南 12「只用 Skill 和项目文件」的配置那段话多了一步：把 `templates/gitignore.template` 里 `delivery/` 那一段忽略规则加进项目的 `.gitignore`。手写的关窗示例带上了 `decisionRef`（`C-<ID>-<当前行数+1>`，和接受行同一规则）。中英两版同步。候选 3b97cd8 经 RUN-GUIDE12-SETUP-01 验证一次通过，codex 只读审查 0 条；所有者批准（D-RUN-GUIDE12-SETUP-01-2）后，候选先以 cf60e96 合入工作分支，再经 PR #119 以 merge commit 3945ca0 进 main。未发版。

## 定了什么

- 两项都按推荐执行：只拷 `delivery/` 那一段，不拷整份模板；关窗示例加编号。
- 这两处是「空仓按指南 12 走一遍」时发现的。那次只照指南手写文件，其余环节运行时都按原样读了回来：接受、带 `Work:` 标记的提交、写回 AGENTS.md、result.md、关窗都对得上。

## 剩下的

- 发版：等所有者决定。

## 写进项目的

- 无：改的就是指南本身，已随候选进了主干。
