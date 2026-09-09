# Intent：导出加日期筛选（WORK-EXPORT-DATE-FILTER）

## 为什么做

月底对账只想看当月流水，现在的 CSV 导出是全量的，用户得在表格里再筛一遍。

## 目标

`exportCsv(ledger, { from, to })` 支持含端点的日期区间，两端都可以省略；导出格式（列序、金额两位小数）不变。

## 非目标

- 不动 `src/ledger.js`（老地盘）；
- 不做界面，没有 UI 交付；
- 不改 CSV 的列和编码。

## 止损线

最多 2 个 Run、3 轮 review、总计 1 小时 worker 时间；越线先问所有者"继续还是砍"。

## 验收条件

- `npm test` 全绿，且新增用例覆盖：无边界、单边界、双边界、区间外为空、坏格式、from>to；
- review 无 P0/P1。
