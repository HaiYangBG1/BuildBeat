# Intent:预算停车只在真失败时发生(WORK-BUDGET-FALSE-STOPS)

## 为什么做

试点工作区回放(9 月 6 日之后的 76 个 Run,即预算批准 +1 修复之后)共出现 19 次
「budget exhausted / review cap」停人,其中约一半不是真失败,而是计数口径造成的误报:

1. **通过的 verify / fix 也扣次数**(5 次):每轮 review 之后「fix → 重新 verify」是正常闭环,
   但每次 verify 都计入 `maxAttempts`,两三轮 review 之后 verify 从未失败也会因「次数用完」停人。
2. **同一轮问两三次**(4 次):review 发现阻断问题 → 停人分诊(`enter-fix`)→ 人批了修 →
   fix、verify 跑完 → 又因 review 轮次用完停人(`resume-review`)。人已经批过「修」,
   「修完再审一次」是同一个决定。
3. **Work 级上限与 Run 级上限各问一次**(1 次):批准 `enter-review`(Work 级 review 上限)
   后紧接着又停在 `resume-review`(Run 级 review 上限)。

另外,提示语只写 `budget exhausted`,读起来像 AI 在反复失败,实际多数时候什么都没失败。

## 目标

- 预算只由**真失败**和 **review 轮次**消耗:非只读步(build / verify / fix)成功的 attempt 不扣次数。
- 一轮 review 最多问人一次:review 轮次已用完时,在 review 发现阻断问题的那一刻就停人,
  批准 = 放行「fix → verify → 再审一轮」整轮,不再二次停车。
- 批准 Work 级 review 上限时同时放行 Run 级上限,反之亦然,不重复问。
- 停人提示用白话说清「用了几轮 / 批准意味着什么 / 拒绝意味着什么」。

## 非目标

- 不改默认值(preset `review: 2`、全局 `maxAttemptsPerStep = 4`、`reviewRoundsPerWork` 语义不变)。
- 不改事件语义:只做加法字段(SPEC-0001 演进规则),旧台账回放结果不变。
- 不做锁残留、并发 Run、SKILL.md 瘦身等其他评审项(另开 Work)。
- 不 merge、不 push、不发版;合并与发布是人的动作。

## 验收条件

- 新增测试复现上述三类误报场景,在修复前失败、修复后通过;
- 真失败的停车行为不变:verify 连续失败到上限仍停人、同指纹两次仍停人、release 预设 `maxAttempts: 1` 仍停人;
- 旧台账(无新字段)回放得到与现在相同的 state;
- `npm test` 与 `npm run check:docs` 全绿;SKILL.md §5、审批指南、CHANGELOG `Unreleased` 同步新口径。

## 止损线

- 最多 2 个 Run;review 累计最多 4 轮(`budgets.reviewRoundsPerWork: 4`);
- 墙钟超过 3 小时未到合并决定,停下先问人是否缩范围。
