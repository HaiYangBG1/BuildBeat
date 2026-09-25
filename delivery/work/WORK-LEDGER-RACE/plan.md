# Plan:并发写台账不再把台账写坏(WORK-LEDGER-RACE)

## 修改范围

`src/v2/storage/event-ledger.js`、`src/v2/runtime/decisions.js`、`src/v2/runtime/orchestrator.js`(`resumeRun`、supersede)、
`src/v2/cli/run.js`(`stop`)、`tests/`、`docs/v2/guide/`、`CHANGELOG.md`。不改事件格式、reducer、锁实现。

## 实现顺序

1. **写入兜底(`EventLedger`)**:记录读取/上次写入后文件的字节长度;`append` 写之前 `statSync` 比对,
   不一致(文件被别的进程追加过、被截断或被删)就抛 `LedgerError`:
   `ledger <path 相对形式或 run id> changed on disk since it was read (another writer); re-read it and retry`,不写任何字节。
   新建台账(文件不存在)时长度按 0 处理;`open` 读取后与每次成功 `append` 后更新长度。
   这一层保证:即使将来有写入方忘了在锁内重读,也只会失败,不会写坏台账。
2. **decisions.js**:`approveRun` / `rejectRun` / `adoptCandidate` 改为先 `acquireLock`,再在锁内 `openWaiting` 读台账并做全部检查
   (pending、transition 匹配、终态等),最后写入;锁在 `finally` 释放。报错文案与现在一致。
3. **stop(`run.js`)**:先 `acquireLock`,锁内再读台账、判断终态、写 `RUN_TERMINAL` 与 run-record。
4. **resumeRun(`orchestrator.js`)**:锁外那次读取只用于给出友好的早退信息(无台账 / 终态 / 等人);
   进入 `withRunLocks` 后**重新打开**台账,并把决定是否续跑、续跑哪一步的检查在新读到的状态上重做一遍,
   后续驱动全部使用锁内打开的台账对象(包括 `makeContext`)。
5. **supersede**:拿到被取代 Run 的锁之后再打开它的台账并重新确认仍是同一 Work、未终态、在等人,再写 `SUPERSEDED`。
6. **测试**(新增 `tests/v2-ledger-race.test.js`):
   - 单元:同一文件开两个 `EventLedger`,A 写入后 B 写入被拒绝且错误含 `changed on disk`;重新打开文件无 corruption、事件数正确;
   - 多进程:用 CLI 建一个停在人批的 Run(脚本 worker),同时 spawn 5 个 `approve` 进程(同一 transition),等全部结束:
     台账重新打开无 corruption,`DECISION_RECORDED` 恰好 1 条,恰好 1 个进程退出码 0,其余退出码非 0 且 stderr 有可读原因;
   - 多进程:同时 spawn `stop` 与 `approve`:台账无 corruption,终态与决定彼此一致(先 stop 则无批准,先批准则 stop 落在批准之后);
   - 多进程:批准非终态转换后,同时 spawn 2 个 `resume`:台账无 corruption,`RUN_STARTED` 在该批准之后只出现一次续跑;
   - 以上断言与进程调度顺序无关;测试清理临时目录,总耗时控制在 20 秒内。
7. **文档**:`docs/v2/guide/10-recovery.md` / `.en.md` 加一小节「`ledger … changed on disk since it was read`」:含义(另一个会话/进程刚写过)、处理(重新执行同一命令即可,不会损坏台账);
   `CHANGELOG.md` `Unreleased` 加一条。

## 风险

- 长度比对只能发现「被改过」,不能区分改动来源;这正是想要的保守行为(宁可让后到者重试)。
- `resumeRun` 锁内重读后,若状态已变(例如另一个 resume 刚跑完),应返回与锁外同样的早退结果而不是报错。
- 驱动在锁内持续写台账,期间别的进程拿不到锁,不会与之竞争;兜底检查对驱动自身零影响(它一直是唯一写入方)。

## 测试方法

verify 步跑 `npm test && npm run check:docs`。

## 回滚方式

Run 分支不合并即无影响;改动不涉及台账格式,revert 即回到旧行为,已写的台账两边都可读。
