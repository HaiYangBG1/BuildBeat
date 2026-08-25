# pm/status/ —— 各 AI 视角状态文件(治看板 race)

> 一个 Builder 端到端拥有当前工作包;产品/全栈/测试只是可选 AI 视角。**每个视角只写自己的 `pm/status/{视角}.md`**(带 commit hash),别人只读 —— 物理上消除"同文件互踩"。NOW/看板做聚合视图,这里不记录成员或岗位。

## 约定
- 写法:**倒序**,每条带 commit hash / 版本 / 状态(✅完成 / 🔄进行 / ⏸阻塞)。
- 🔒 **hash 必须写在反引号里**(`` `hash` `` 或 `` `仓名 hash` ``):bus-check 的幽灵 hash 核验**只认反引号内的 token**——约定即解析规则,裸写的 hash 不被核验。
- hash 指向**工作包交付候选/测试或评审报告**的 commit,不是 status 行自身 commit(那会形成不可能的自引用并诱发无穷 status 提交)。同仓交付先提交候选,再集中写一次 status;阻塞且无新候选时写已核基线 hash +「无新候选」,不得臆造。
- **条目克制**:下游只需要「做了什么 + hash + 证据指针」,长篇分析放报告文件、此处放链接。
- **按工作包更新**:原子 commit 可保持细粒度,但 status 只在工作包完成、里程碑候选形成或真实阻塞时更新一次;不得为每个子任务/文档/commit 追加一条并把它当成向用户交接。
- reviewer 结论只写 `mode + candidate hash 集 + P0/P1 是否清零 + 报告/closure 表指针`;不得把问题原文和逐轮整改全文复制进 status。
- 跨域要对齐的(契约/依赖)→ 走 `../changes/` 变更提案;决策包收敛 → 先落 `../decisions.md`(规则⑨)。
- 🗜 **压缩仪式(换期时当前工作包 Builder / 产品视角执行)**:当期条目全文 `cp` 进 `../archive/<期>/status-{视角}-<期>全程.md`,live 文件截断只留「当前基线 + 最近 1 条 + 归档指针」。

## 收工核对

1. 工作包真正到达 terminal condition,受影响测试/必要的 L3、L4 证据已落盘。
2. candidate/report hash 已回读可解析;完成工作包的看板块含唯一 `**证据**:` 行。
3. contracts / decisions / 当期看板 / 本视角 status 与候选一致,无流水式重复记录。
4. 跑 `bash scripts/bus-check.sh --strict`;非阻断 warning/unverified 也写入收尾边界,不外推为全局已验证。

## 模板(每个域文件)
```md
# 状态 · <域>
> 只此域写,别人只读。倒序。

## 当前基线
- <长期成立的事实;会腐的事实(版本等)放"怎么查"的指针>

## 倒序日志
- **<yyyy-mm-dd>** 工作包:<objective 的结果> · candidate/report `<hash 或 hash 集>`(无新候选则写 base `<hash>`) · 证据:<命令/文件:行/截图路径> · ✅/🔄/⏸
```
