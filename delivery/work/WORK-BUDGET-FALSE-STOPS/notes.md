# Builder notes — RUN-BUDGET-FALSE-STOPS-01

- 范围外发现：审批指南“五个词”表把 reject 的终态写成 `FAILED`，`src/v2/runtime/decisions.js` 实际落 `CANCELLED`；该处不是本 plan 的预算语义修改，保留原文，建议另行修正文档。
- 已核对展示口径：status 展示实际 attempt 次数，overview 展示运行成本，doctor 展示配置预算；没有把退款后的 attempt 当作预算分子展示的 `5/4` 比值，本次未改这些模块。
- 验证边界：builder 未执行需要监听端口的 `tests/v2-notify.test.js`；完整 `npm test && npm run check:docs` 留给 verify 步。未 commit、push 或切换分支。
