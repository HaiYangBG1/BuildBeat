# 导出加日期筛选

## 目标

月底对账只想看当月流水，现在的 CSV 导出是全量的，用户得在表格里再筛一遍。

做完后 `exportCsv(ledger, { from, to })` 支持含端点的日期区间，两端都可以省略；导出格式（列序、金额两位小数）不变。

## 起因

小周：「导出能不能只导这个月的」。口径定在 `pm/decisions.md` 的【EXPORT-1】。

- ref: EXPORT-1

## 已核实的现状

- `exportCsv(ledger)` 只有一个参数，导出全部流水（`src/export.js`）。
- `src/ledger.js` 是老地盘，只维护。
- 测试命令是 `npm test`，跑 `node --test tests/*.test.js`（`package.json`）。

## 范围

包含：`src/export.js`、`tests/export.test.js`。

不包含：`src/ledger.js`；界面；CSV 的列和编码。

## 开工前待拍板

接受本说明即按「推荐」执行。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 日期格式不对，或 from 晚于 to | 直接报错，错误信息分别含 `bad date bound`、`is after` | 当成没有流水返回空表：用户会以为当月没记账 |

## 验收

机器检查：`npm test` 全过，新增用例覆盖无边界、单边界、双边界、区间外为空、坏格式、from 晚于 to。

由人确认：无。

## 实现步骤

1. `exportCsv` 增加第二个参数 `options = {}`，读 `from` / `to`。
2. 两个边界都按 `YYYY-MM-DD` 校验。
3. 用字符串比较做含端点筛选（ISO 日期字符串可以直接比大小）。
4. 补测试。

## 停止条件

要动 `src/ledger.js`，或要改 CSV 的列，停下问。
