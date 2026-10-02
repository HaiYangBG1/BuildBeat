# Intent:YAML 子集解析器不再绊人(WORK-YAML-SUBSET)

## 为什么做

所有配置(run-config、workflow、风险预设、observe、notify)都走自写的严格 YAML 子集解析器。它刻意 fail-closed,但有几处把**合法、常见**的写法拒掉或解析错,报错还会误导:

- `stopAt: []`、`vars: {}` 这类空列表/空映射被拒(报 unsupported YAML syntax);
- 列表项与键同一缩进的写法(`key:` 下一行直接 `- a`,很多编辑器和 AI 默认这么写)被拒,报错却是 `key "key" has no value`;
- 不带引号的列表项里只要有冒号就被当成映射:`- http://x` 报「expected a space after "http:"」,让人摸不着头脑;
- 文件开头带 BOM(Windows 编辑器常见)直接被拒;
- `007` 这类带前导零的值被静默解析成数字 `7`。

run-config 大多由 AI 会话代写,这些都是真实会写出来的形状。

## 目标

- 空列表 `[]` 与空映射 `{}` 可用;非空的行内 `[...]` / `{...}` 仍然拒绝,报错直接说「每项一行 `- item`」;
- 列表项可以与所属键同缩进(紧凑写法),结果与缩进两格的写法完全一致;
- 不带引号的列表项:形如 `key: value` 的才是映射;像 `http://x` 这样不含 `": "` 的当普通字符串;
  含 `": "` 但前半截不是合法键的(如 `- echo a: b`,真 YAML 会把它读成映射)**不猜**,报错要求加引号;
- 去掉开头的 BOM;
- 带前导零的整数(如 `007`,`0` 本身除外)保留为字符串,不再静默变成另一个值;
- 「has no value」等报错给出能照做的改法(写 `[]`、把子项缩进到键下面、给值加引号)。
- 现有所有合法配置解析结果**逐字节不变**。

## 非目标

- 不支持锚点、别名、标签、块标量、多文档、非空行内集合、单引号转义等(仍 fail-closed);
- 不改 `yes` / `no` 的语义(按 YAML 1.2 仍是字符串;run-config 校验已会指出 `inheritEnv: yes`);
- 不 merge、不 push、不发版。

## 验收条件

- 单元测试逐条覆盖上述每种写法:修复前失败或解析错,修复后得到预期结果;以及仍然拒绝的写法(非空行内集合、`- echo a: b`、锚点等)报错清楚;
- 兼容性:仓库内所有 YAML(预设、模板、示例、`delivery/`、`.buildbeat/`)新旧解析结果完全相同(测试);
  另外(本机核对,不进仓):所有者各试点工作区现存的 run-config / workflow / observe / notify 等 YAML 新旧解析结果全部相同;
- `npm test` 与 `npm run check:docs` 全绿;SKILL.md、快速上手、run-config 样板里「没有行内 `[]` / `{}`」的说法同步;CHANGELOG `Unreleased` 同步。

## 止损线

- 最多 2 个 Run;review 累计最多 3 轮(`budgets.reviewRoundsPerWork: 3`);
- 墙钟超过 3 小时未到合并决定,停下先问人。
