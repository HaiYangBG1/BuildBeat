# pm/changes/ —— 变更提案(治跨域 race + drift)

> 跨域变更(尤其动**契约/需求/多域**的)**不要直接抢改看板/契约文件** —— 先在这写一个独立 change,拍板后实现,归档时把 delta 合并进 canonical。

## 何时用
- **重轨**改动:跨期 / 契约变更 / 多域大改。小改快轨、单需求标准轨,都不用建 change。

## 流程
1. **提案** → 新建 `pm/changes/<yyyymmdd>-<短名>.md`(用下方模板)。
2. **拍板** → 用户/产品域评审:批 / 改 / 否(落 `../decisions.md` 一行)。
3. **实现** → 各域按 change 里"分工"动手,commit hash 回写**自己的** `pm/status/<域>.md`。
4. **归档** → 完成 + 核查门过 → 产品域把 Delta 合并进 canonical(`contracts/PROTOCOL.md` / 需求文档),change 移到 `pm/changes/archive/`。

## 模板(复制改)
```md
# CHANGE: <短名>
- 状态:提案 / 已拍板 / 实现中 / 已归档
- 发起:<域> ｜ 日期:<yyyy-mm-dd> ｜ 轨道:重 / 标准
## 动机(为什么)
## Delta(改什么 —— 逐条标 ADDED / MODIFIED / REMOVED)
- [MODIFIED] PROTOCOL.md §X:<旧 → 新>
## 保护项(这次改动不许伤到的既有能力,逐条列)
## 分工(谁做)
| 域 | 做什么 | commit |
|---|---|---|
## 验收点(怎么验 —— 核查门逐条核,必带可核验证据)
- [ ] <证据:测试命令 / 文件:行 / 线上实测 / 截图>
```
