# 4.0 发布前四项意图决定：结果

范围与对外名字见 [work.md](work.md)。由 4.0 源码运行时驱动（RUN-…-02 起使用 `f308744` 的冻结副本），候选 `cfa0893`，RUN-4.0-INTENT-FOLLOWUPS-02 以 SUCCEEDED 结束；合并到 main 走 PR，另行决定。

## 交付

| 决定 | 结果 |
|---|---|
| UI 截图证据 | `requireScreenshot: true`；verify 把 PNG 写进 `BUILDBEAT_SCREENSHOT_DIR`；只接受可解码的 PNG（块布局、校验和、影响解码的附加块、逐行重建与调色板索引），采集、缓存复用、批准用同一规则；合并检查以最近一次通过的 verify 的截图为准 |
| 上线收尾 | `buildbeat release --config` 在合并后运行项目回读命令并写入 `releases.jsonl`（请求的 ref 与实际检出分别记录）；`decide --action close` 只在最近一次回读通过时关窗 |
| 治理模板 | 保持移出，理由改为"4.0 聚焦交付闭环，项目治理规范不在范围内" |
| 无运行时参与 | `docs/v2/guide/12-without-runtime`：可读、可写（含记录格式）与不得声称的事项；文档检查要求中英记录示例一致 |

## 过程

| 轮次 | 发现 | 处理 |
|---|---|---|
| 1 | 11 | 截图类型与符号链接、单 Run 决定卡摘要、`--ref` 提交、并发日志、测试缺口，全部修复 |
| 2 | 5 | 结构检查、同候选重验被旧截图阻断、文档示例字面校验，全部修复 |
| 3 | 5 | 所有者决定截图只收 PNG（work.md 重新接受，新开 RUN-…-02） |
| 4 | 7 | PNG 块布局、调色板与隔行、缓存与批准同一规则、混合格式记录原因，全部修复 |
| 5 | 3 | 超大声明尺寸导致 verify 崩溃、附加块校验、滤波后调色板测试，全部修复 |
| 6 | 3 | 两条压缩文本块（解码器等价方向）按所有者停止线驳回；文档措辞与零宽测试修复 |
| 7 | 0 | 进入合并决定（预算外一轮，所有者批准） |

审查发现与裁决全文见 [review-findings.jsonl](review-findings.jsonl)，决定记录见 [decisions.jsonl](decisions.jsonl)。

## 验证

Node 回归 302 项、文档检查、Bash 信封、Claude 插件、安装后首跑、Work 范围 `git diff --check`、3.3.1 四场景对照全部通过。worker 计时约 1 小时。
