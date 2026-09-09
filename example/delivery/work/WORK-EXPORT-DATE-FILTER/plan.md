# Plan：导出加日期筛选（WORK-EXPORT-DATE-FILTER）

## 修改范围

`src/export.js`、`tests/export.test.js`（allowedPaths：`src`、`tests`）。

## 实现顺序

1. `exportCsv` 增加第二个参数 `options = {}`，读 `from` / `to`；
2. 两个边界都按 `YYYY-MM-DD` 校验，坏格式抛 `bad date bound`，`from > to` 抛 `is after`（【EXPORT-1】拍板：不静默）；
3. 用字符串比较做含端点筛选（ISO 日期字符串可直接比大小）；
4. `tests/export.test.js` 补：无边界、单边界、双边界、区间外为空、坏格式、from>to。

## 测试方法

verify 步跑 `npm test`（`node --test tests/*.test.js`），退出码回读为证据。

## 风险与回滚

只加参数、默认行为不变，老调用方不受影响；候选不合并即无影响，Run 的工作树可整体 `gc`。
