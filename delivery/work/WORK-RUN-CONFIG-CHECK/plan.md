# Plan:run-config 写错时起跑前就说清楚(WORK-RUN-CONFIG-CHECK)

## 修改范围

新增 `src/v2/cli/run-config-check.js`(纯函数校验);`src/v2/cli/run.js` 的 `loadRunConfig` 调用它;`tests/`;`docs/v2/guide/`;`CHANGELOG.md`。
不改 YAML 解析器、不改配置语义与默认值。

## 实现顺序

1. **校验模块** `checkRunConfig(config, { workflow })` → 问题列表(字符串数组),分两段调用:
   - **第一段(不依赖工作流,解析后立即做)**:
     - 顶层必须是 map;必填 `repo`、`work`、`run`、`workflow`,均为非空字符串;
     - 已知顶层键:`repo work run workflow riskPreset base entry stopAt stepTimeoutMs maxAttemptsPerStep allowedPaths budgets cache envelope requires workers policies redact reviewTriage supersede stallAfterMs`;
       其余一律报错,并按「忽略大小写相同」或编辑距离 ≤ 2 给出 `did you mean <key>?`;
     - `work` / `run`:字符串,匹配 `^[A-Za-z0-9][A-Za-z0-9._-]*$`、不含 `..`、长度 ≤ 100;若解析成数字,提示「给它加引号」;
     - `stepTimeoutMs` / `maxAttemptsPerStep`:正整数;`base` / `entry` / `riskPreset`:非空字符串;
     - `stopAt` / `allowedPaths` / `policies` / `redact` / `requires`:列表(`allowedPaths` 元素为非空字符串);
     - `workers`:必填的 map,每个 worker 是 map,`command` 为非空字符串;已知字段 `command args timeoutMs inheritEnv env`,其余报错带建议;
       `args` 为列表;`timeoutMs` 正数;`inheritEnv` 只能是布尔 `true` / `false`(`yes`、`"true"` 等报错);`env` 为 map;
     - `envelope`:map,已知字段 `prompts vars pin`,其余报错带建议。
     - 已有的 `reviewTriage` / `supersede` / `stallAfterMs` / `budgets` / `cache` / `redact` 校验保持原样(不重复实现)。
   - **第二段(加载工作流之后)**:每个 worker 名必须被某个工作流步骤的 `worker` 引用(否则报错并建议最接近的工作流 worker 名);
     `stopAt` 的每一项与 `entry` 必须是工作流步骤 id。
   - 任一段有问题:抛一个错误,首行 `run config <相对仓库或 cwd 的路径> has N problem(s):`,之后每行 `  - <key>: <问题与改法>`,
     一次列全,不遇到第一个就停。
2. **接入**:`loadRunConfig` 在 `parseYamlSubset` 之后立刻跑第一段(因此缺 `repo` 不再落到 Node 内部错误),加载工作流后跑第二段;
   `start` / `resume` / `doctor` / `preflight` / `approve --config` 全部经由它,自动获得同样的报错。
3. **测试**(新增 `tests/v2-run-config-check.test.js`):
   - 纯函数:上面每一类问题各一条;一个同时有 3 个问题的配置,报错里 3 条都在;建议文案(`stopat` → `stopAt`、`reviwer` → `reviewer`);
   - CLI:`doctor --config <坏配置>` 退出码非 0 且 stderr 含问题清单;缺 `repo` 时报错提到 `repo` 而不是 `paths[1]`;
   - 兼容:遍历仓库内 `templates/v2/run-config.example.yaml`、`example/delivery/work/*/run-config.yaml`、`delivery/work/*/run-config.yaml`,全部通过两段校验。
4. **本机兼容核对**(不进仓,结果写进本 Work 的 `notes.md`,只写数量不写路径与项目名):用新校验跑一遍所有者各工作区现存 run-config,全部通过。
5. **文档**:`docs/v2/guide/02-workflow-guide.md`(run-config 小节)补一段「写错时的报错形态」,
   恢复手册(中英)症状表加一行「run config … has N problem(s)」;`CHANGELOG.md` `Unreleased` 加一条。

## 风险

- 严格拒绝未知键可能挡住某些现有配置:已核对仓库内与本机 104 份现存配置全部只用已知键;真有新键需要加入白名单即可,不会静默出错。
- worker 名必须被工作流引用:自定义工作流里只配了但没用到的 worker 会被拒;本机现存配置无此情况。

## 测试方法

verify 步跑 `npm test && npm run check:docs`。

## 回滚方式

Run 分支不合并即无影响;校验是加载前的一层纯函数,revert 即回到旧行为。
