// 记账核心（老地盘：只维护，改动一律先问人）。
// 一条流水 = { date: "YYYY-MM-DD", category, amount, note }；金额以分为单位的整数。

export function addEntry(ledger, entry) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
    throw new Error(`bad date: ${entry.date}`);
  }
  if (!Number.isInteger(entry.amount)) {
    throw new Error("amount must be an integer number of cents");
  }
  return [...ledger, { note: "", ...entry }];
}

export function total(ledger) {
  return ledger.reduce((sum, entry) => sum + entry.amount, 0);
}
