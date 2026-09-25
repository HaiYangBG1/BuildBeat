# Plan:resume 找得到自动编号的 Run(WORK-RESUME-RUN-FAMILY)

## 修改范围

`src/v2/cli/run.js`(必要时在 `src/v2/runtime/` 加一个只读的解析 helper)、`tests/`、`docs/v2/guide/`、
`SKILL.md`、`CHANGELOG.md`(allowedPaths 强制,越界即停)。orchestrator 只改一句停车提示(第 6 步),不改 reducer / 事件。

## 实现顺序

1. **解析规则**(`commandResume`,在 `loadRunConfig` 之后、`--adopt` 之前决定 `options.runId`):
   - 给了 `--run`:必须等于配置的 `run`,或匹配 `^<run>-\d{2,}$`(家族名做正则转义,复用 `nextAttemptId` 的写法);
     否则报错 `--run <X> is not in run family <run> of this config`;对应台账不存在也报错。
   - 没给 `--run`:若 `.buildbeat/runtime/runs/<run>/events.jsonl` 存在 → 用它(精确 ID 配置,行为不变)。
   - 否则在 `.buildbeat/runtime/runs/` 找匹配 `<run>-NN` 的台账,读 state,取未终态(`state.terminal` 为空)的:
     - 恰好 1 个 → 用它,打印 `resuming <id> (the open run of family <run>)`;
     - 0 个 → 报错 `no open run in family <run>`,并附最新一次的 id 与终态(没有任何台账就说没有);
     - 多个 → 报错列出它们,提示 `--run <RUN-ID>`。
   - `--adopt` 与 stall watcher 用解析后的 run id。
2. **approve 提示**:非终态批准后的提示改为
   `decision recorded; continue with: buildbeat resume --config <run-config.yaml> --run <RUN-ID>`(填入真实 run id),
   去掉旧名 `run.js`。
3. **帮助文本**:`resume` 用法行加 `[--run <RUN-ID>]`。
4. **测试**(新增 `tests/v2-resume-family.test.js`,走真实 CLI,参照 `tests/v2-envelope.test.js` 的 `cli()` 写法与脚本 worker):
   - 家族配置 + `start --attempt new` 停人 → `approve` → `resume --config` 续跑 `-01` 并到下一个停点;
   - `--run <家族>-01` 显式可用;`--run OTHER-01` 被拒;
   - 唯一的 Run 已终态时 `resume --config` 报 `no open run in family`,并带最新 id 与终态;
   - 精确 Run ID 配置(不用 `--attempt new`)行为不变;
   - `approve` 输出包含 `buildbeat resume --config` 与 `--run <id>`。
   测试结束清理自己建的临时目录。
5. **文档**:`docs/v2/guide/07-approval-guide.md` / `.en.md`、`10-recovery.md` / `.en.md`、`01-quickstart.md` / `.en.md`
   里 `resume --config` 的地方补一句「用 `--attempt new` 时会自动续跑该家族唯一未终态的 Run,也可 `--run` 指定」;
   `SKILL.md` §0.5.1 批准行同步;`CHANGELOG.md` `Unreleased` 加一条。

6. **顺带(上一个 Work 的 review P2)**:`src/v2/runtime/orchestrator.js` 的 `budgetReasons` 目前无条件写
   `(successful attempts are not charged)`,但只读步(review、release 回读等 `readonly: true` 的步)成功仍扣次数。
   按该步 `readonly` 区分:非只读步保留这句;只读步改为 `(each round is charged)`。补一条断言覆盖只读步的提示。

## 风险

- 家族名是另一个家族名的前缀(如 `RUN-A` 与 `RUN-A-B`):正则必须锚定 `^<run>-\d{2,}$`,`RUN-A-B-01` 不能算进 `RUN-A`。
- 读别的 Run 的台账只读、不拿锁;真正续跑时仍由 `resumeRun` 拿锁。

## 测试方法

verify 步跑 `npm test && npm run check:docs`。

## 回滚方式

Run 分支不合并即无影响;改动只在 CLI 解析与提示,revert 即回到旧行为。
