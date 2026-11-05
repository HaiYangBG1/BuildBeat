# WORK-RELEASE-ENVS 结果

`buildbeat release --config <cfg> --env <name>` 把环境记进回读记录，并且只从 `--env` 设 `BUILDBEAT_RELEASE_ENV` 给回读命令：一份配置管所有环境，分几步上线的每步用 `--note` 记。`buildbeat status --releases [--all-repos] [--json]` 按环境列出最近一次通过的回读，之后又失败的标出。只写 `repo`、`work`、`release:` 的配置只记回读，没跑 Run 的工作通过它绑定到在发布 ref 里最新的代码提交；写了 `workers:` 的配置照旧先要成功的 Run。新增 `templates/v2/operations.example.md`，结果页模板把它定为操作规矩和坑的默认去处。

候选 71fe1e7 经 RUN-RELEASE-ENVS-02 两轮审查（1 条 P1 已修）验证通过，所有者批准（D-RUN-RELEASE-ENVS-02-3），合入会话分支（4222b1c），再经 PR #124 以 merge commit e57da2c 进 main，v2 已快进。RUN-RELEASE-ENVS-01 没跑任何一步就停掉（起点的文档检查因范围外的驾驶记录失败）。未发版。

## 定了什么

- 所有者「全部接受并开工」，六项按推荐（A-WORK-RELEASE-ENVS-1）：环境用 `--env` 加环境变量、步骤用 `--note`、每个环境只列最近一次通过的、没跑 Run 的工作绑定它追得到的最新代码提交、只记回读的配置不要 `workers:`、手册放 `docs/operations.md`。
- 反馈第 5 条（运维工作类型）只取这部分；BuildBeat 自己执行上线和 4.0 定下的"不做部署"冲突，不做。
- "不跑 Run 也能回读"只对只记回读的配置生效：一开始对所有配置放开，旧测试抓到本来要跑 Run 的工作会拿草稿提交去回读、进而关窗。
- 环境名限定为字母、数字、`.`、`_`、`-`；审查后环境变量只来自 `--env`，不再从配置或宿主继承。

## 剩下的

- 发版：等所有者决定。
- 试点已有的 64 条回读记录都没写环境，`status --releases` 在试点上暂时只有一行；要不要改用 `--env`，由试点所有者决定。
- 关窗仍看"最近一次回读"，不分环境；分环境上线多了以后要不要按环境看，留给以后。
- 示例项目的 `example/AGENTS.md` 没加 `status --releases` 那句（原句仍然成立）。

## 写进项目的

- lessons.md @ ce1d40b — 第 28 条：照审查意见修好一边，修法又在另一边开了口子
