# decisions — 拍板台账(全工作区唯一决策单点)

> **规则(AGENTS ⑨ 单点事实)**:一个真实决策包收敛后,**第一动作 = 在此追加一行**(倒序),然后才去回写受影响的 SSOT(intent/plan/设计稿);「回写」列登记落点,没回写完 = 欠账可见。Run 级批准不进这里,它们由内核落在各 Work 的 `decisions.jsonl`。

| 日期 | 拍板人 | 决策包 | 回写(落点 → 状态) |
|---|---|---|---|
| 2026-09-09 | 小周 | 【EXPORT-1】导出日期筛选:from/to 含端点;两端都可省;格式只认 `YYYY-MM-DD`,坏格式和 from>to 直接报错不静默;金额列保持两位小数、不加币种 | `delivery/work/WORK-EXPORT-DATE-FILTER/plan.md` → ✅ |
| 2026-09-09 | 小周 | 【BOOTSTRAP】接入 BuildBeat:单仓、长期做;一个 Builder 端到端;`src/ledger.js` 为老地盘只维护;无 UI;worker 用 `codex exec`;通知先不接(等待只在 inbox 里);`standards/` 不生成 | `AGENTS.md` §1 边界、`delivery/envelope/prompts/*`、`run-config.yaml` → ✅ |
