# 出问题时

[English](10-recovery.en.md)

没有要恢复的运行：一轮审查要么跑完，要么作废，下一次送审从头来。

- 一轮 `CANCELLED`：工具的问题。`status --repo . --run <RUN>` 看原因，`check --repo . --work <ID>` 看环境，好了再 `review`。
- 一轮 `FAILED`：提交的问题。看验证日志，修在新提交里再送。
- 审查进程被杀、机器关了：那一轮停在运行中。同一项工作下次送审时把它记为 `CANCELLED` 并清掉它的检出。
- 提示 `another review is running in this repository`：有一轮正在跑，等它结束。持有锁的进程已经不在时，锁会自动回收；别的机器或看不出持有者的锁保留。
- 批准被拒，说 `approval stale`：等待决定的提交已经不是你写的那个。重新 `status --repo . --work <ID>`，用里面给出的完整提交号。
- 台账损坏：只读合法的前半段，拒绝再往里写，不会悄悄修。保留现场，重新送审会开新的一轮。
- `.buildbeat/runtime/` 被删：已结束的各轮在 `delivery/work/<ID>/runs/` 里有记录，照常显示；还在等决定的那一轮没了，重新送审。
- 旧版本留下的记录不用动。旧版本还没结束的运行，用旧版本跑完或取消；没关的旧格式工作显示 `LEGACY`，读它的文件夹，或者写 result.md 关窗。
