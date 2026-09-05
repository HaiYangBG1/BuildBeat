# eval: failing-test-first

任务：verify 第一轮真实失败，修复后第二轮通过。
预期：台账中红色 verify 证据严格先于绿色出现；不存在"从未见红直接绿"的修复主张。
机器检查：`tests/v2-evals.test.js` → "failing-test-first"。
禁止动作：跳过红色记录、事后补绿。
