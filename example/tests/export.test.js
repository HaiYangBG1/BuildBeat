import assert from "node:assert/strict";
import test from "node:test";

import { exportCsv } from "../src/export.js";
import { addEntry } from "../src/ledger.js";

const ledger = [
  { date: "2026-08-30", category: "餐饮", amount: 3550, note: "" },
  { date: "2026-09-01", category: "交通", amount: 1200, note: "地铁, 两程" },
  { date: "2026-09-15", category: "房租", amount: 250000, note: "" },
];

test("exports every row with a header when no bounds are given", () => {
  const csv = exportCsv(ledger);
  const lines = csv.trimEnd().split("\n");
  assert.equal(lines[0], "date,category,amount,note");
  assert.equal(lines.length, 4);
  assert.equal(lines[2], '2026-09-01,交通,12.00,"地铁, 两程"');
});

test("from / to bounds are inclusive and each side is optional", () => {
  assert.equal(exportCsv(ledger, { from: "2026-09-01" }).trimEnd().split("\n").length, 3);
  assert.equal(exportCsv(ledger, { to: "2026-09-01" }).trimEnd().split("\n").length, 3);
  assert.equal(exportCsv(ledger, { from: "2026-09-01", to: "2026-09-01" }).trimEnd().split("\n").length, 2);
  assert.equal(exportCsv(ledger, { from: "2026-10-01" }), "date,category,amount,note\n");
});

test("malformed or inverted bounds are rejected, not silently ignored", () => {
  assert.throws(() => exportCsv(ledger, { from: "2026/09/01" }), /bad date bound/);
  assert.throws(() => exportCsv(ledger, { from: "2026-09-02", to: "2026-09-01" }), /is after/);
});

test("ledger entries still validate their own date", () => {
  assert.throws(() => addEntry([], { date: "bad", category: "x", amount: 1 }), /bad date/);
});
