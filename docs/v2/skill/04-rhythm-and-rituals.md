# BuildBeat 方法论 · 节奏与三个仪式（原 §5–§6）

> 从 [`SKILL.md`](../../../SKILL.md) 移出的正文，原文与原节号不变，只调整了相对链接；入口、驾驶手册与红线摘要仍在 `SKILL.md`。

## 5. 节奏:风险预设决定人批点

```
写 intent/plan → 人接受(digest 绑定) → Run:Build → Verify → Review → Fix(自动闭环,预算封顶)
→ 停在合并决定(人批;SUCCEEDED ≠ 已合并) → 人合并/push → release-readback 车道:回读 → 人做 → 回读 → 观察 → 人关窗
```

| Risk Preset | 人批点 | 用在 |
|---|---|---|
| `fast` | 仅合并决定 | 小改、可逆、不碰契约 |
| `standard`(默认) | plan 接受 + 合并决定 | 单功能 |
| `controlled` | intent + plan 接受 + 合并决定 + 上线 | 契约变更、大改、不可逆副作用 |
| `release` | 配 `release-readback` 预设:preflight 回读 → 人做 → apply 回读 → 关窗 | 生产动作 |

机器闸(gitleaks pre-commit)、证据制与合并候选一次核查任何预设都不跳;高风险 delta 不得借 `fast` 绕过独立核查。预算耗尽是停人不是失败。非只读步(build / verify / fix)成功不扣 `maxAttempts`,只读步仍按尝试次数计费,review 按轮计费;基础设施故障(超时 / 崩溃 / 非 JSON / exit 75)判 `infra` 停人、不派 fixer、不扣预算。真失败到顶仍停 `resume-<step>`,批准多给一次。同一步总 attempt 达到有效预算上限(配置值 + 人批扩额)的 3 倍后,下一次执行前以 kind `budget` 兜底停人,防止成功循环失控;退款不抬高该兜底上限。

**一轮一问**:review 发现阻断问题且下一轮会超 Run 或 Work 上限时,提前停 `enter-fix`;有分诊用 `finding-triage`,无分诊用 `budget`。批准覆盖「修复 + 重新验证 + 再审一轮」,所需扩额随请求的可选 `grants` 落账,Run/Work 同时到顶只问一次;拒绝结束本 Run,由人按现有证据决定是否合并。批准旧的 `enter-review` / `resume-review` 预算停车时也同时放行已到顶的另一层上限。新候选或过期批准不能沿用旧请求的 grants。默认上限不变。

## 6. 三个仪式(防腐烂的关键,缺了机制必朽)

### 6.1 开工同步

1. 协调层与每个要动的子仓分别 `git pull`;无上游或离线必须明说,不伪称已同步。
2. `buildbeat overview --repo .`:活动 Work、等人的 Run、成本;`inbox` 看有没有等你批的;`observe status` 看生产。
3. 按 `AGENTS.md → 所属 Work 的 intent/plan → contracts → pm/decisions.md → 最近 run-record` 读承重事实。
4. 认领一个端到端工作包,确认 `objective / in_scope / terminal_condition` 与止损线。
5. 核对要动的文件、契约、candidate 与现有证据没有 stale(`overview` 会标 `stale`);不可逆动作前必须再跑一遍开工同步。
6. 只在确认写边界后动手;无法实查的范围记为 `unverified`,不猜。

**每条规则都问「违反了会怎样」;答案只是「靠自觉」时,就该机器化。**

### 6.2 执行中同步

1. 契约/决策先落权威文件,再改共享实现;冻结后的语义 delta 命中 `STOP_NOW`。
2. 原子 commit 可以细,但只在工作包里程碑候选、完成或真实阻塞时向人收口。
3. 不在 Run 跑着的时候改它的候选;要手修就等它停下,在 worktree 里改完提交,`resume --adopt <sha>`。
4. 新事实若使 intent/plan/contracts 失配,在同一变更批次内修回(plan 改了要重新 `accept`);不等收工补旧账。
5. 对无法验证、远端未回读的部分保留 `unverified`,不把局部绿外推为全局通过。

### 6.3 收工同步

1. 确认工作包达到 `terminal_condition`,不把单个子产物当完成。
2. 里程碑候选必须来自一次完整 Run:verify 真跑、reviewer 真核,证据在 run-record 与 `status` 里;会话自己跑的测试只是补充。
3. 回写 contracts / `pm/decisions.md` / intent-plan;已完成工作包的证据就是 run-record + 合并决定,不再另写证据文件。
4. 再跑一次 `overview`,把 warning / unverified 原样写进收口;不用 exit 0 替代覆盖面判断。
5. 确认各仓工作树与 staged 范围;他人 WIP、散落临时文件未收敛时,不声称候选就绪。
6. 一屏收尾(§6.4):交付结果、证据、未验证边界、挂账/真实阻塞、下一步该谁。

### 6.4 域回复格式

每个 AI 视角面向用户收口、交接或回复明确检查点时,统一按「已做 → 未做 → 下一步」输出。这个格式只约束收口事实,不要求中间进展或探索讨论套模板。

```md
## 〔当前视角〕｜✅ 已完成 / 🔄 未完成

### 已做

1. 〔功能或业务结果〕
   - 证据：〔candidate、Run、verify 结果或报告〕

### 未做

1. 〔还没完成或没验证什么〕
   - 原因：〔具体原因〕

### 下一步

- **本视角已完成：** 下一棒是〔哪个视角 / 谁〕，负责〔业务级目标〕。
- **本视角未完成：** 需要〔谁〕提供或确认〔什么〕。
- **无需协助：** 我继续做，暂不交棒。
```

口径:

- `已做`只写功能或业务级结果,不罗列文件和实现细节;证据紧跟它所支持的事项。多项共用同一份证据时,改在列表末尾写一次「共同证据」。
- `未做`必须同时写原因;未验证范围也放这里。没有就写「无」,不把局部验证外推为整体完成。
- `下一步`只保留符合当前状态的一项。下一棒按剩余目标决定,不是固定的产品 → 全栈 → 测试流水线;整个工作包已完成就写「下一棒:无」。
- 本视角未完成但仍能在已批范围内安全推进时,不向用户伪求助;继续做。只有真实阻塞或用户明确要检查点时,才用「需要帮助」或「我继续做,暂不交棒」收口。

### 6.5 读数怎么读

先按级别处理,不要只看退出码。`overview` / `status` / `doctor` 全是只读;它们的读数从台账、Git 主干和真实命令推导,不从会话自述来。

| 读数 | 它证明什么 | 当下动作 |
|---|---|---|
| Run `SUCCEEDED`(停在合并决定) | 候选通过 verify 与 review,具备合并条件 | 人看证据后合并;`SUCCEEDED` ≠ 已合并 |
| `WAITING_HUMAN` kind `approval` / `triage` / `budget` | 内核在等一个具体的人批转换 | `inbox` 看等什么,批哪一步说清哪一步 |
| `WAITING_HUMAN` kind `infra` | worker 环境/后端故障,不是候选缺陷 | 修环境,`approve --transition resume-<step>`;不派 fixer |
| `STALLED` | 无输出超过阈值,只标不杀 | 看最后输出与历史中位数,决定等还是停 |
| `stale`(intent/plan/批准) | 被批准的对象改过 | 重新 `accept` / 重新批,旧批准不复用 |
| 证据 `UNVERIFIED` / `REUSED` | 没核到 / 同树同命令复用 | 前者不得当通过;后者可信但要能说出复用自哪次 |
| `overview` 的 `MERGED` / `RELEASED` / `STOPPED_*` | 从主干、车道、门推导出的阶段 | 按 `next:` 行行动;已合并/已发布不再提未裁决数 |

### 6.6 拍板仪式与换期

当前工作包的产品视角先把验收清单压成真实决策变量并批量呈现;用户拍板后 → 该视角**按收敛决策包**在 `pm/decisions.md` 落一行(决策+回写落点)→ 再分发回写各 SSOT。部分对话进度留在决策卡,不污染永久台账。

换期 = 关闭 Work:候选已合并/已发布后在 `decisions.jsonl` 记关闭,`gc --repo .` 清终态 Run 的工作树,`overview` 不再列它。**同时做回灌一问**:本期踩到 BuildBeat 没覆盖的新坑了吗?有 → 回上游 `lessons.md` 登记。
