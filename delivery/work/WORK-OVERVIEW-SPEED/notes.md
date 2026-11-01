# 驾驶记录

- 驱动运行时：本机全局 CLI 5.3.0（与 main `0277d27` 的运行时代码相同）。builder 和 fixer 不配 worker：驾驶会话在 Run 工作树里亲自写，以 `run --adopt` 交给 verify 和只读 reviewer。
- 所有者 2026-11-01 说「全部做完，需要我拍板的时候找我」。会话先让只读子代理剖析（没有改任何仓库），再起草本说明并按推荐接受，记为 `A-WORK-OVERVIEW-SPEED-1`（AI 会话）。会改输出的第三处改法（转到代码仓的工作在全仓视图里附带单项详情）不在本工作里，另交所有者定。
- 交 Run 前，在工作树里先写测试，不改代码跑：
  - 新增两条都失败。6 项工作、各带一份运行台账时，每份台账被打开 20 次（运行中的台账）或 14 次（已结束的）；完整提交号也走了 `merge-base`，没有 `rev-list`。
  - 按待拍板第 3 项改的那一处旧断言也失败：`merge-base` 2 次。
  - 改完后 `tests/v2-cross-repo-status.test.js` 15 条全过，另外三个总览测试文件也全过。
- 测试里的台账改成已结束的。运行中的 Run 在跨仓总览里还会再读全部台账，算典型步骤耗时（`describeLiveness` → `typicalDurations`）。说明里把 `typicalDurations` 划在范围外，真实工作区里运行中的 Run 很少（试点这条路径一共 99 次打开）。
- 直接用 `node --test` 跑时，会受本会话里 `CLAUDECODE` 等变量影响，「ordinary local status JSON」那条会失败（决定算成 AI 会话）。`npm test` 通过 `tests/support/no-agent-env.js` 去掉了这些变量，所以以 `npm test` 为准。
- 试点只读对比（同一份数据，先跑新后跑旧，在主仓里跑 `status --repo . --all-repos`）：
  - 文字输出：新 4.3 秒，旧 30.8 秒，逐字节相同（2,544 字节）。
  - `--json`：新 3.9 秒，旧 29.4 秒，逐字节相同（约 700 KB）。
  - 第一次比对显示不同，原因是计时那一行被写进了输出文件；去掉那一行后完全相同。
- 候选 `8d06449` 本地跑完 verify.sh 全过（408 条测试、文档检查、信封 20/20、插件 7/7、安装后首跑 17/17、`git diff --check`），然后以 `run --adopt` 交给 Run。
- RUN-OVERVIEW-SPEED-01：verify 一次通过（3 分钟），codex 只读审查第 1 轮 0 条。停在合并决定，等所有者批准。
- 所有者 2026-11-01 对整批推荐说「全部按推荐」，记为合并批准 `D-RUN-OVERVIEW-SPEED-01-2`（人，经 AI 会话录入）。候选以 merge commit `c9719e0` 合入会话分支 `claude/overview-speed`。第三处会改输出的改法按所有者定不做。
