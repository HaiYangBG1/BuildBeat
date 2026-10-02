# Intent:驱动进程被杀后,锁不再把 Run 卡死(WORK-STALE-LOCKS)

## 为什么做

锁是一个空目录(`.buildbeat/runtime/locks/<id>.lock`),不记录谁持有,只在正常退出的 `finally` 里删除。
驱动进程被 SIGKILL / 宿主工具超时杀掉 / 机器重启时,`active-run.lock` 与 `<RUN>.lock` 都会残留:

- `resume` 先拿仓库级 `active-run` 锁,直接报 `another run is active`——内核已有的崩溃恢复(`RUN_INTERRUPTED` → 重跑中断步)根本走不到;
- 恢复手册让人用 `stop` 释放锁,但 `stop` 自己要先拿 `<RUN>.lock`,只会报 `already locked`,而且它从不碰 `active-run.lock`;
- `gc` 只清终态 Run 的锁;`start` 的报错只能建议「确认没有驱动进程后手删锁目录」。

结果是一次宿主超时就要人去手删 runtime 目录,这正是长任务最常见的中断方式。

## 目标

- 每把锁记录持有者(进程号、主机名、获取时间、命令);
- 拿锁时发现持有者**可以证明已死**(同一台主机、进程已不存在),自动回收并继续;
- 持有者还活着 / 在别的主机 / 无法判断时,不回收,报错写清持有者是谁、下一步怎么做;
- 被杀后的 Run 能直接 `resume` 走崩溃恢复,`stop` 也能用;`gc` 能清掉持有者已死的 `active-run` 锁。

## 非目标

- 不做 SIGTERM / SIGINT 处理器(驱动在 `spawnSync` 里阻塞时处理器跑不了,SIGKILL 也拦不住;可靠方案是事后回收);
- 不放开「每仓只允许一个活动 Run」,不改台账先读后锁的竞态(另开 Work);
- 不自动回收没有持有者信息的旧版锁(可能是旧版本驱动仍在跑),只给清楚的手工指引;
- 不 merge、不 push、不发版。

## 验收条件

- 集成测试:真实 `buildbeat start` 驱动在 worker 执行中被 SIGKILL 后,不删任何文件,`resume --config` 直接完成崩溃恢复并继续跑到下一个停点;
  同样场景下 `stop` 能把 Run 落 `CANCELLED`;
- 单元测试:持有者存活(本进程)→ 不回收且报错含 pid;持有者已死 → 回收;别的主机 → 不回收;无持有者信息的旧锁 → 不回收并给手工指引;
  回收过程中锁已被别人换成新的持有者 → 不删别人的锁;
- 其余行为不变(正常拿锁/放锁、supersede 跳过被锁的 Run、`gc` 原有动作);
- `npm test` 与 `npm run check:docs` 全绿;恢复手册(中英)「锁卡住」一节、`gc` 说明、CHANGELOG `Unreleased` 同步。

## 止损线

- 最多 2 个 Run;review 累计最多 3 轮(`budgets.reviewRoundsPerWork: 3`);
- 墙钟超过 3 小时未到合并决定,停下先问人。
