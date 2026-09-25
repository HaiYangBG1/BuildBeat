# Plan:驱动进程被杀后,锁不再把 Run 卡死(WORK-STALE-LOCKS)

## 修改范围

`src/v2/workspace/workspace-manager.js`(锁本体)、`src/v2/runtime/orchestrator.js`(`lockActive` 报错)、
`src/v2/runtime/gc.js`、`src/v2/cli/run.js`(`start` 被挡时的提示、`stop`)、`tests/`、`docs/v2/guide/`、`SKILL.md`、`CHANGELOG.md`。
不改事件、reducer、台账格式。

## 实现顺序

1. **持有者记录**:`acquireLock` 在 `mkdirSync(lockPath)` 成功后立即写 `lockPath/owner.json`:
   `{ "pid": process.pid, "host": os.hostname(), "acquiredAt": ISO 时间, "command": process.argv 里的子命令(没有就 null) }`。
   `releaseLock` 不变(整目录删除)。
2. **判定持有者状态**(导出一个纯函数,便于测试,例如 `inspectLock(lockPath)` → `{ state: "alive" | "dead" | "foreign-host" | "unknown", owner }`):
   - 没有或读不出 `owner.json` → `unknown`(旧版锁,或 mkdir 与写文件之间崩溃);
   - `owner.host !== os.hostname()` → `foreign-host`;
   - `process.kill(pid, 0)` 抛 `ESRCH` → `dead`;成功或抛 `EPERM` → `alive`。
3. **安全回收**:`acquireLock` 遇 `EEXIST` 时 inspect;只有 `dead` 才回收:
   - 把锁目录 `rename` 成同目录下唯一的墓碑名(如 `<id>.lock.stale-<本 pid>-<随机>`),再读墓碑里的 `owner.json`,
     **必须与刚才判定为死的持有者完全一致**(pid + host + acquiredAt);不一致说明锁在此期间被别人换过 → 尝试 `rename` 回原名,本次按「已被持有」报错;
   - 一致则删墓碑、重新 `mkdirSync` 拿锁(若此时 `EEXIST`,说明别人抢先拿到了新锁,按已被持有报错,不再回收);
   - 回收成功在 stderr 打一行:`reclaimed stale lock <id> (owner pid <pid> on <host> is gone, acquired <时间>)`。
   - 其余状态抛 `WorkspaceError`,消息写清持有者(pid / host / 获取时间 / 命令)和下一步:
     `alive` → 「该进程仍在运行;等它结束,或确认后结束该进程」;`foreign-host` → 「由另一台主机持有,到那台机器处理」;
     `unknown` → 「没有持有者信息(旧版本的锁?);确认没有 buildbeat 进程在跑后删除 <lockPath>」。
   - `listHeldRunLocks` 忽略墓碑名。
4. **报错透传**:`orchestrator.js` 的 `lockActive` 目前吞掉原始错误只说 `another run is active`;改为保留该前缀并附上持有者信息;
   `run.js` 里 `start` 被挡时「stale active-run lock with no run holding it」那段提示同步成新口径(死锁会自动回收,只剩活着/旧版/异机三种情况需要人)。
5. **`stop`**:沿用 `acquireLock`,自动获得死锁回收;不改语义。
6. **`gc`**:计划里对 `active-run.lock` 判定一次,`dead` 时加 `remove-lock` 动作(理由写持有者已死);其他状态列入 keep 并写明原因。
7. **测试**:
   - 新增 `tests/v2-stale-locks.test.js`(单元):存活持有者(本进程)不回收且报错含 pid;死持有者(先 `spawnSync(process.execPath, ["-e", ""])` 拿到一个已退出的 pid)被回收;
     `host` 为别的主机不回收;无 `owner.json` 的旧锁不回收并给路径;回收时墓碑里的持有者与判定的不一致 → 原锁被还原、不被删除;墓碑名不出现在 `listHeldRunLocks`;
   - 新增集成测试(同文件或 `tests/v2-kill-recovery.test.js`):用脚本 worker(第 1 次 attempt 睡 30 秒、之后立即成功),
     `detached: true` 启动真实 `bin/buildbeat.js start --config … --attempt new`,轮询台账直到出现该步 `STEP_STARTED`,对进程组 `SIGKILL`;
     然后 `resume --config` 不删任何文件即成功,台账出现 `RUN_INTERRUPTED`,中断步重跑并走到下一个停点;另一用例对被杀的 Run 执行 `stop`,落 `CANCELLED`;
   - 测试结束清理自己建的临时目录,集成测试总耗时控制在 20 秒内。
8. **文档**:`docs/v2/guide/10-recovery.md` / `.en.md` 的「锁卡住」一节按新行为重写(先说会自动回收,再说三种需要人处理的情况);
   同文件 `gc` 段落里「active-run 锁仍需手工处理」同步;`CHANGELOG.md` `Unreleased` 加一条;`SKILL.md` 如有相关表述同步。

## 风险

- pid 复用:死进程的 pid 被无关进程复用会被判为 `alive` → 保守不回收,报错里有 pid 可供人核对;不做进程启动时间比对(跨平台代价大)。
- 并发回收:两个进程同时判定同一把死锁;墓碑 + 持有者核对保证不会删掉别人刚拿到的新锁。
- Windows:`process.kill(pid, 0)` 语义一致;`rename` 目录在 Windows 上对非空目标失败,行为仍安全。

## 测试方法

verify 步跑 `npm test && npm run check:docs`。

## 回滚方式

Run 分支不合并即无影响;锁目录多一个 `owner.json`,旧版本 CLI 仍可正常删除整个目录,revert 即回到旧行为。
