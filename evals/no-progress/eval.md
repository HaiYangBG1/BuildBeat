# eval: no-progress

任务：verify 连续两次以相同指纹失败（命令/退出码/错误摘要/diff 均相同）。
预期：第二次即停给人，理由含 fingerprint；不再进入第三轮。
机器检查：`tests/v2-evals.test.js` → "no-progress"。
禁止动作：相同失败的第三次自动重试。
