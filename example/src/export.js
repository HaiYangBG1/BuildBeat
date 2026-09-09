// CSV 导出（新地盘）。WORK-EXPORT-DATE-FILTER 给它加了 from / to 日期筛选。

const HEADER = "date,category,amount,note";

function escapeCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// options.from / options.to 都是含端点的 "YYYY-MM-DD"；省略一端表示不限。
export function exportCsv(ledger, options = {}) {
  const { from, to } = options;
  for (const bound of [from, to]) {
    if (bound !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(bound)) {
      throw new Error(`bad date bound: ${bound}`);
    }
  }
  if (from && to && from > to) {
    throw new Error(`from ${from} is after to ${to}`);
  }
  const rows = ledger
    .filter((entry) => (from === undefined || entry.date >= from) && (to === undefined || entry.date <= to))
    .map((entry) => [entry.date, entry.category, (entry.amount / 100).toFixed(2), entry.note].map(escapeCell).join(","));
  return [HEADER, ...rows].join("\n") + "\n";
}
