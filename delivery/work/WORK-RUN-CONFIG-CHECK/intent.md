# Intent:run-config 写错时起跑前就说清楚(WORK-RUN-CONFIG-CHECK)

## 为什么做

BuildBeat 自称 fail-closed,但 run-config 的加载几乎不校验:

- 缺 `repo` 时报的是 Node 内部错误 `The "paths[1]" argument must be of type string`,看不出是哪个键;
- 顶层键拼错(如 `stopat`、`reviewtriage`)被**静默忽略**,Run 照样起跑,只是边界和分诊都没生效;
- worker 名拼错(如 `reviwer`)同样静默:那一步没有 adapter,Run 跑到那里才停下「attended handoff」;
- worker 的 `inheritEnv: yes` 被当成字符串,静默变成 `false`;
- `work` / `run` 不校验字符,却直接拼进路径与分支名;写成数字(`run: 007`)会被解析成 `7`。

这些错误都要到 Run 跑到一半、或者行为和预期不一样时才被发现,而 run-config 大多是 AI 会话代写的。

## 目标

- `start` / `resume` / `doctor` / `preflight` / `approve --config` 读 run-config 时,在做任何事之前先校验,
  **一次列出全部问题**,每条写清是哪个键、错在哪、该怎么改;拼错的键给出最接近的正确键名;
- 校验覆盖:必填键、未知顶层键、各键的类型与取值、worker 名是否被工作流用到、worker 与 envelope 的未知字段、`stopAt` / `entry` 是否是工作流里的步骤、`work` / `run` 的字符与类型;
- 现有合法配置零改动即可通过。

## 非目标

- 不改 YAML 子集解析器本身(行内 `[]`、紧凑列表、BOM 等另开 Work);
- 不改配置语义与默认值,不新增配置项;
- 不 merge、不 push、不发版。

## 验收条件

- 单元测试逐条覆盖:缺必填键、未知顶层键(带「did you mean」建议)、worker 名不在工作流里、worker 未知字段、`inheritEnv` 非布尔、
  `timeoutMs` / `stepTimeoutMs` / `maxAttemptsPerStep` 非正数、`stopAt` / `entry` 不是步骤、`work` / `run` 含非法字符或是数字、多个问题一次全部列出;
- 兼容性测试:仓库内所有 run-config(模板、示例项目、`delivery/work/*`)全部通过校验;
  另外(本机核对,不进仓):所有者各试点工作区现存的 104 份 run-config 全部通过;
- `doctor` 对错误配置输出同样的问题清单;
- `npm test` 与 `npm run check:docs` 全绿;Workflow 指南或恢复手册说明报错形态,CHANGELOG `Unreleased` 同步。

## 止损线

- 最多 2 个 Run;review 累计最多 3 轮(`budgets.reviewRoundsPerWork: 3`);
- 墙钟超过 3 小时未到合并决定,停下先问人。
