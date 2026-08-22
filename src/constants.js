import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

export const CLI_VERSION = packageJson.version;
export const SCAFFOLD_VERSION = `v${CLI_VERSION.split(".").slice(0, 2).join(".")}`;
export const OUTPUT_SCHEMA_VERSION = 1;
export const MANIFEST_PATH = ".solobaton/manifest.json";
export const MANIFEST_SCHEMA_VERSION = 1;

export const SCRIPT_NAMES = [
  "bus-check.sh",
  "design-preview.sh",
  "drift-check.sh",
  "pre-commit.sh",
  "verify-status.sh",
];

export const COMMON_REQUIRED_FILES = [
  ".claude/agents/reviewer.md",
  "AGENTS.md",
  "ARCHITECTURE.md",
  "CLAUDE.md",
  "contracts/PROTOCOL.md",
  "pm/NOW.md",
  "pm/changes/README.md",
  "pm/decisions.md",
  "pm/status/README.md",
];

export const IGNORED_SCAN_DIRECTORIES = new Set([
  ".claude",
  ".codex",
  ".git",
  ".solobaton",
  ".next",
  ".nuxt",
  ".output",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
]);

export const RENDER_REQUIRED_PLACEHOLDERS = {
  ".claude/agents/reviewer.md": ["<项目名>"],
  "AGENTS.md": [
    "<项目名>",
    "<N>",
    "<代码仓1>",
    "<代码仓2>",
    "<被测仓>",
    "<PreStop/drain 机制>",
  ],
  "ARCHITECTURE.md": [
    "<项目名>",
    "<项目是什么、给谁用、核心取舍>",
    "<用户入口>",
    "<前端/客户端>",
    "<仓名>",
    "<部署单元>",
    "<网关/服务A>",
    "<审计/可观测>",
    "<服务B>",
    "<服务C>",
    "<项目根>",
    "<代码仓1>",
    "<代码仓2>",
    "<说明>",
    "<部署平台/区域>",
    "<应用/服务清单:名称+ID+实例>",
    "<入口/域名/LB>",
    "<数据库/缓存>",
    "<服务A 凭据>",
    "<路径/获取命令>",
    "<运行时 env 实查>",
    "<平台 CLI 命令>",
  ],
  "SOLOBATON.md": ["<X.Y>", "<yyyy-mm-dd>", "<默认|紧凑>"],
  "contracts/PROTOCOL.md": [
    "<项目名>",
    "<vX.Y.Z>",
    "<上线日期>",
    "<边界A:服务X ↔ 服务Y>",
    "<对齐点>",
    "<怎么核的:实测命令/代码行/配置查询>",
  ],
  "gitignore.template": ["<代码仓1>", "<代码仓2>"],
  "pm/NOW.md": ["<期名>", "<一句话状态>", "<快轨|标准轨|重轨>", "<期>", "<域>"],
  "pm/decisions.md": [
    "<yyyy-mm-dd>",
    "<谁>",
    "<包ID>",
    "<默认 2–5 个真实取舍的收敛结论;单项决定直接写一句>",
    "<文件/落点>",
  ],
  "pm/当期看板.md": [
    "<期名>",
    "<工作包名>",
    "<这轮最终要交付什么结果,不用文件名代替>",
    "<产品 / 全栈 / 测试;各自仍只写自己的边界>",
    "<为达成结果可自动继续的关联任务/域/文件边界>",
    "<带证据完成 / 必须由人处理的真实阻塞 / 用户明确的检查点>",
    "<N>",
    "<Gate>",
    "<需求1>",
    "<跨边界接口/字段/机制 约定;契约口径落 `contracts/PROTOCOL.md`>",
    "<对照需求清单 + 设计稿逐屏;上线前必过的清单>",
  ],
  "scripts/drift-check.sh": ["<应用1>", "<应用2>", "<代码子仓1>"],
  "scripts/verify-status.sh": ["<套件1>", "<套件2>", "<代码子仓1>", "<代码子仓2>"],
  "指挥台.md": ["<被测仓>"],
};

export const FILE_POLICIES = {
  REPLACE_IF_UNMODIFIED: "replace-if-unmodified",
  THREE_WAY_ONLY: "three-way-only",
  PROJECT_OWNED: "project-owned",
  MERGE_ONLY: "merge-only",
};

export function filePolicy(templatePath) {
  if (templatePath === "gitignore.template") {
    return FILE_POLICIES.MERGE_ONLY;
  }
  if (
    templatePath === "CLAUDE.md" ||
    templatePath === ".claude/agents/reviewer.md" ||
    (/^scripts\//.test(templatePath) && templatePath !== "scripts/verify-status.sh")
  ) {
    return FILE_POLICIES.REPLACE_IF_UNMODIFIED;
  }
  if (
    templatePath === "AGENTS.md" ||
    templatePath === "SOLOBATON.md" ||
    templatePath === "指挥台.md"
  ) {
    return FILE_POLICIES.THREE_WAY_ONLY;
  }
  return FILE_POLICIES.PROJECT_OWNED;
}
