# Plan:YAML 子集解析器不再绊人(WORK-YAML-SUBSET)

## 修改范围

`src/v2/engine/yaml-subset.js`、`tests/`、`docs/v2/guide/01-quickstart.md` / `.en.md`、`SKILL.md`、`templates/v2/run-config.example.yaml`、`CHANGELOG.md`。
不改任何调用方(workflow / run-config / 风险预设 / observe / notify 的加载逻辑不动)。

## 实现顺序

1. **BOM**:`parseYamlSubset` 入口去掉开头的 `﻿`。
2. **空集合**:`parseScalar` 对去掉空白后恰为 `[]` / `{}` 的值返回 `[]` / `{}`;其余以 `[` / `{` 开头的仍拒绝,
   报错改为 `inline lists/maps are not supported except [] and {}; write one "- item" per line`。
3. **紧凑列表**:`parseMap` 遇到 `key:`(无值)且下一行与该键**同缩进**并以 `- ` 开头时,按该缩进解析列表作为值;
   列表在遇到同缩进的非 `- ` 行时结束,映射继续解析后续键。缩进两格的原写法行为不变。
4. **列表项的映射/标量判定**:单行列表项仅当匹配 `^[A-Za-z0-9_.-]+:( |$)`(合法键 + `": "` 或行尾冒号)才按映射解析;
   不含 `": "` 且不以 `:` 结尾的(如 `http://x`、`a:b`)按标量;含 `": "` 但前半截不是合法键的(如 `echo a: b`)报错
   `list item "echo a: b" contains ": "; quote it (- "echo a: b") or write it as key: value`。多行列表项沿用现有判定。
5. **前导零**:`/^-?0\d+$/` 的值按字符串返回(`0`、`-0`、`10` 等照旧是数字)。
6. **报错改法**:`key "x" has no value` 改为
   `key "x" has no value: give it a value, write x: [] for an empty list, or indent its items under it`;
   其它报错保持行号与原文。
7. **测试**(新增 `tests/v2-yaml-subset-fixes.test.js`,已有 `tests/v2-yaml*.test.js` 不改):
   - 每条修复一例:BOM、`[]`、`{}`、紧凑列表(与缩进写法结果 deepEqual)、紧凑列表后接同级键、`- http://x`、`- a:b`、`- key: value` 仍是映射、`007` → `"007"`、`0`/`10`/`-3` 仍是数字;
   - 仍拒绝:`[a, b]`、`{a: 1}`、`- echo a: b`(报错含「quote it」)、锚点/别名、tab、多文档;
   - 兼容:遍历仓库内所有 `.yaml` / `.yml`(`src/v2/presets/**`、`templates/**`、`example/**`、`delivery/**`、`.buildbeat/*`),
     凡是**修改前版本**能解析的,逐个断言新解析器的结果与之完全一致。修改前版本原样冻结为 `tests/fixtures/yaml-subset-v1.js`
     (不依赖 git 历史,CI 浅克隆与 npm 包里都能跑);以后仓库里新增使用新写法的 YAML,旧版本解析失败的直接跳过对比。
8. **本机兼容核对**(不进仓,只把数量写进本 Work 的 `notes.md`):对所有者各试点工作区所有 BuildBeat 相关 YAML(run-config、workflow、observe、notify、policies)做新旧解析对比,全部一致。
9. **文档**:`SKILL.md` §0.5.3 注释、`templates/v2/run-config.example.yaml` 首部注释、`docs/v2/guide/01-quickstart.md` / `.en.md`
   把「没有行内 `[]` / `{}`」改成「行内只允许空的 `[]` / `{}`」,并各补一句「列表项可与键同缩进」;`CHANGELOG.md` `Unreleased` 加一条。

## 风险

- 语义变化只发生在「以前报错」或「以前静默改值(前导零)」的输入上;兼容性测试逐字比对现有文件,确保合法输入结果不变。
- 前导零变字符串偏离 YAML 1.2(那里 `007` 是 7);这是刻意的 fail-closed 取舍:宁可让需要数字的地方报类型错,也不静默改值。

## 测试方法

verify 步跑 `npm test && npm run check:docs`;新测试先在修改前的解析器上确认失败。

## 回滚方式

Run 分支不合并即无影响;改动只在解析器,revert 即回到旧行为,已有配置两边解析一致。
