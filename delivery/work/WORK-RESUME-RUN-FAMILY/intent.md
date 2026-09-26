# Intent:resume 找得到自动编号的 Run(WORK-RESUME-RUN-FAMILY)

## 为什么做

`start --config <cfg> --attempt new` 把 run 配置里的名字当「家族名」,自动编号成 `<家族>-01/02…`;
但 `resume --config <cfg>` 仍然只拿配置里的家族名去找台账,报 `no ledger for run <家族>`,也没有参数能指定是哪一次。
结果是:按文档「批准非终态转换 → `resume --config` 续跑」这条最常走的路,在推荐的 `--attempt new` 用法下直接走不通,
会话只能临时复制一份把 `run:` 改成带编号的配置来绕。另外 `approve` 的提示仍写着旧名 `run.js resume --config …`。

## 目标

- `resume --config <cfg>` 在配置里是家族名时,自动找到该家族**唯一一个未终态**的 Run 续跑,并说明续跑的是哪一个;
- `resume` 支持 `--run <RUN-ID>` 显式指定,只接受该家族本身或 `<家族>-NN`;
- 找不到或找到多个未终态 Run 时给出能照做的报错(列出候选、提示 `--run`);
- `approve` 的续跑提示改成可直接复制的 `buildbeat resume --config <run-config.yaml> --run <RUN-ID>`。

## 非目标

- 不改 `start` 的编号规则、不改 supersede 语义;
- 不改内核(orchestrator / reducer)行为,只改 CLI 解析与提示;唯一例外是顺带修正上一个 Work 遗留的一句预算停车提示(review P2);
- 不做锁残留、并发 Run 等其他评审项;不 merge、不 push、不发版。

## 验收条件

- CLI 级测试:`start --attempt new` → 停人 → `approve` → `resume --config`(家族名)续跑的是 `-01`;
  `--run` 显式指定可用;`--run` 指向别的家族被拒;家族内没有未终态 Run 时报错并说出最新一次的终态;
  配置里写的就是精确 Run ID 时行为与现在一致;
- `approve` 输出的续跑提示带 `buildbeat` 与 `--run`;
- `npm test` 与 `npm run check:docs` 全绿;审批指南、恢复指南(中英)、快速上手、SKILL.md、CHANGELOG `Unreleased` 同步。

## 止损线

- 最多 2 个 Run;review 累计最多 3 轮(`budgets.reviewRoundsPerWork: 3`);
- 墙钟超过 2 小时未到合并决定,停下先问人。
