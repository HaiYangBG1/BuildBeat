# Plan:预算停车只在真失败时发生(WORK-BUDGET-FALSE-STOPS)

## 修改范围

`src/v2/runtime/orchestrator.js`、`src/v2/engine/reducer.js`、`tests/`、`SKILL.md`、
`docs/v2/guide/`、`templates/v2/`、`CHANGELOG.md`(allowedPaths 强制,越界即停)。

## 实现顺序

1. **成功不扣次数(reducer + orchestrator)**
   - orchestrator 落 `STEP_FINISHED` 时,若 `status === "succeeded"` 且该步不是只读步(`stepDef.readonly !== true`),
     加可选字段 `free: true`;对应 `BUDGET_CONSUMED.amount` 记 0。
   - reducer 在 `STEP_FINISHED` 带 `free: true` 时累加 `steps[step].freeAttempts`(与现有 `infraAttempts` 同构,
     `STEP_STARTED` 时保留该值)。
   - `maxAttemptsFor(step)` 在现有 `+ infraAttempts` 之后再 `+ freeAttempts`。
   - 防失控兜底:同一步本 Run 总 attempt 数超过「有效上限 × 3」时仍停人(kind `budget`,理由写明是兜底),
     防止自定义 workflow 出现只由成功边组成的环。
2. **一轮只问一次(orchestrator)**
   - review 结果为 `findings-blocking` 时,先算「下一轮 review 是否会超 Run 级上限 / Work 级上限」。
   - 会超:无论 `reviewTriage` 是否为 `required`,都在此刻停 `enter-fix`,kind 为 `finding-triage`(有分诊)或 `budget`(无分诊),
     `HUMAN_REQUESTED` 加可选字段 `grants`(如 `[{"step":"review","scope":"run"},{"step":"review","scope":"work"}]`),
     理由首行用白话:「review 已用 2/2 轮;批准 = 修复 + 重新验证 + 再审一轮,拒绝 = 结束本 Run、按现有证据决定合并与否」。
   - 不会超:行为与现在一致(有分诊就停分诊,没分诊就自动派 fixer)。
   - `resumeRun` 批准时,若对应 `HUMAN_REQUESTED` 带 `grants`,逐条落 `BUDGET_EXTENDED`(run 级 / `scope: "work"`),再驱动。
3. **Work 级与 Run 级互相放行(orchestrator)**
   - 批准 kind `work-review-cap` 时,若 review 同时已达 Run 级上限,再落一条 Run 级 `BUDGET_EXTENDED`;
   - 批准 Run 级 `resume-review` 预算停车时,若 Work 级也已到顶,同样补一条 `scope: "work"`。
4. **白话提示**:所有预算停车的首行改为「<步> 已用 N/M 次(真失败 X 次)」+ 批准/拒绝各一句;
   保留 `budget` 子串(`metrics.js` 靠它计 budget stops)。
5. **测试**(新增 `tests/v2-budget-false-stops.test.js`,用脚本 worker):
   - A:三轮 review(每轮 1 个 P1)且 verify 全绿 → 不出现任何 verify 预算停车;
   - B:`reviewTriage: required`,第 2 轮 review 发现阻断 → 只停一次 `enter-fix`(带 grants),批准后跑完 fix/verify/review 第 3 轮不再停;
   - C:无分诊配置,同上场景 → 停在 `enter-fix`(kind `budget`)而不是 fix+verify 之后的 `resume-review`;
   - D:Work 级上限批准后不再出现 Run 级 `resume-review` 停车;
   - E(回归):verify 连续真失败到上限仍停;同指纹两次仍停;release 预设 `maxAttempts: 1` 失败仍停;
   - F(兼容):无 `free` / `grants` 字段的旧台账回放 state 与现在一致。
6. **文档**:SKILL.md §5 与 §0.5.3 注释、`docs/v2/guide/07-approval-guide.md`、`templates/v2/run-config.example.yaml` 注释、
   `CHANGELOG.md` `Unreleased` 同步新口径(「成功不扣次数;一轮一问」)。

## 风险

- 改变了「attempt」与「预算」的对应关系:`status` / `overview` / `doctor` 里展示次数的地方要一起核对口径,避免显示 `5/4`。
- `grants` 在批准前若候选变化(subject stale),应随请求一起失效,不能沿用到新请求。

## 测试方法

verify 步跑 `npm test && npm run check:docs`;新增测试先在修复前的代码上确认失败(builder 在 stdout 说明)。

## 回滚方式

Run 分支不合并即无影响;新字段均为可选加法,合并后回滚只需 revert 该提交,旧台账不受影响。
