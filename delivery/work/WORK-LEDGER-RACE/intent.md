# Intent:并发写台账不再把台账写坏(WORK-LEDGER-RACE)

## 为什么做

Run 台账(`events.jsonl`)是哈希链:每条事件带 `seq` 与上一条的 digest。`EventLedger.append` 用**内存里读到的** `seq` 与 digest 计算下一条。
但几个写入方都是「先读台账、做判断、再拿锁、然后用先前读到的对象写入」:

- `approveRun` / `rejectRun` / `adoptCandidate`(`decisions.js`)在 `openWaiting` 里读台账并检查,之后才 `acquireLock`;
- `stop`(`run.js`)先读台账,再 `acquireLock`;
- `resumeRun` 先读台账、做全部检查,再进 `withRunLocks`,锁内继续用锁外读到的台账对象;
- supersede 同样先读后锁。

两个会话/进程几乎同时操作同一个 Run(两个会话都去批准、批准时另一个在 `resume`、`stop` 与 `approve` 撞上)时,后写的一方会写出重复的 `seq` 和断开的哈希链;
下次读台账即判定损坏,Run 只能停下等人,且没有自动修复路径。人和多个 AI 会话同时操作正是 BuildBeat 的目标场景。

## 目标

- 所有写台账的操作,在拿到锁之后**重新读**台账,并在锁内基于新读到的状态做检查、写入;
- 台账写入本身带兜底:发现文件在读取之后被别人写过,拒绝写入并报清楚的错误(重读后重试即可),而不是写坏文件;
- 并发操作时,结果一定是「一个成功,其余清楚地失败」,台账始终完整可读。

## 非目标

- 不改事件格式、哈希链规则、reducer 语义;
- 不改锁本身(上一个 Work 已处理残留锁),不放开「每仓只允许一个活动 Run」;
- 不处理 observe 台账(单独的写入路径,另议);
- 不 merge、不 push、不发版。

## 验收条件

- 单元测试:同一台账文件的两个读者,一个先写后,另一个写入被拒绝(错误指明台账在读取后已变化),文件仍完整;
- 并发测试(真实多进程):对同一个等人的 Run 同时发起多个 `approve`,恰好一个成功、其余清楚失败,台账完整且只有一条批准;
  `stop` 与 `approve` 同时发起,台账完整、终态一致;两个 `resume` 同时发起,只有一个在驱动,台账完整;
- 原有测试全绿(行为除并发场景外不变);
- `npm test` 与 `npm run check:docs` 全绿;恢复手册(中英)说明新错误的含义与处理,CHANGELOG `Unreleased` 同步。

## 止损线

- 最多 2 个 Run;review 累计最多 3 轮(`budgets.reviewRoundsPerWork: 3`);
- 墙钟超过 3 小时未到合并决定,停下先问人。
