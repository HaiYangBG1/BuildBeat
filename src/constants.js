import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

export const CLI_VERSION = packageJson.version;
export const SCAFFOLD_VERSION = `v${CLI_VERSION.split(".").slice(0, 2).join(".")}`;
export const OUTPUT_SCHEMA_VERSION = 2;
export const PRODUCT_NAME = "BuildBeat";
export const LEGACY_PRODUCT_NAME = "Solobaton";
export const MARKER_FILE = "BUILDBEAT.md";
export const LEGACY_MARKER_FILE = "SOLOBATON.md";
export const MANIFEST_PATH = ".buildbeat/manifest.json";
export const LEGACY_MANIFEST_PATH = ".solobaton/manifest.json";
export const MANIFEST_PATHS = [MANIFEST_PATH, LEGACY_MANIFEST_PATH];
export const MANIFEST_SCHEMA_VERSION = 2;
export const SUPPORTED_MANIFEST_SCHEMA_VERSIONS = [1, 2];

export const GITIGNORE_BEGIN_MARKER = "# >>> buildbeat managed >>>";
export const GITIGNORE_END_MARKER = "# <<< buildbeat managed <<<";
export const LEGACY_GITIGNORE_BEGIN_MARKER = "# >>> solobaton managed >>>";
export const LEGACY_GITIGNORE_END_MARKER = "# <<< solobaton managed <<<";
export const GITIGNORE_MARKER_PAIRS = [
  [GITIGNORE_BEGIN_MARKER, GITIGNORE_END_MARKER],
  [LEGACY_GITIGNORE_BEGIN_MARKER, LEGACY_GITIGNORE_END_MARKER],
];

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

// Optional, project-owned template libraries. They ship in the package so an
// AI session can use them on demand, but they are never part of the default
// init/adopt plan or the required scaffold surface.
export const OPTIONAL_TEMPLATE_PREFIXES = ["standards/", "pm/adr/"];

export const IGNORED_SCAN_DIRECTORIES = new Set([
  ".claude",
  ".codex",
  ".git",
  ".buildbeat",
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
  "BUILDBEAT.md": ["<X.Y>", "<yyyy-mm-dd>", "<默认|紧凑>"],
  "contracts/PROTOCOL.md": [
    "<项目名>",
    "<vX.Y.Z>",
    "<上线日期>",
    "<代码子仓1>",
    "<bus-baseline.json app 名或 n/a>",
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
    "<产品 / 全栈 / 测试;按需调用,各自仍只写自己的边界>",
    "<为达成结果可自动继续的关联任务/AI视角/文件边界>",
    "<带证据完成 / 必须由人处理的真实阻塞 / 用户明确的检查点>",
    "<完成时填一条可核验的仓库相对路径 / candidate hash;未完成留空>",
    "<N>",
    "<Gate>",
    "<需求1>",
    "<跨边界接口/字段/机制 约定;契约口径落 `contracts/PROTOCOL.md`>",
    "<对照需求清单 + 设计稿逐屏;上线前必过的清单>",
  ],
  "pm/adr/ADR-0000-template.md": [
    "<标题>",
    "<yyyy-mm-dd>",
    "<为什么现在必须做这个长期技术决定>",
    "<最终选择及其边界>",
    "<正向、负向与回滚影响>",
    "<方案 A / B / C 及未选原因>",
    "<工作包 / 契约 / evidence 路径或 n/a>",
  ],
  "scripts/drift-check.sh": ["<应用1>", "<应用2>", "<代码子仓1>"],
  "scripts/verify-status.sh": ["<套件1>", "<套件2>", "<代码子仓1>", "<代码子仓2>"],
  "standards/STACK.md": [
    "<项目名>",
    "<运行时及版本约束>",
    "<包管理器及 lockfile>",
    "<主要语言与框架>",
    "<数据库 / 缓存 / 消息设施>",
    "<部署平台 / 容器基线>",
    "<CI 与测试命令>",
    "<许可证 / 供应链约束>",
    "<.nvmrc / engines.node 的精确值；多值重复本行；无则 n/a>",
    "<lockfile 文件名；多类重复本行；无则 n/a>",
    "<Dockerfile FROM 镜像；多值重复本行；无则 n/a>",
  ],
  "standards/CODE.md": ["<项目名>", "<代码组织与命名约定>", "<项目特有禁止事项>"],
  "standards/REVIEW.md": ["<项目名>", "<项目特有 Review 条件>"],
  "standards/DESIGN.md": [
    "<项目名>",
    "<设计原则>",
    "<排版 / 色彩 / 间距 token 来源>",
    "<核心组件与复用边界>",
    "<项目特有例外>",
  ],
  "指挥台.md": ["<被测仓>"],
};

export const FILE_POLICIES = {
  REPLACE_IF_UNMODIFIED: "replace-if-unmodified",
  // Schema 1 compatibility only. New plans and schema 2 manifests never emit
  // this historical policy.
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
    templatePath === "AGENTS.md" ||
    templatePath === "BUILDBEAT.md" ||
    templatePath === "指挥台.md" ||
    (/^scripts\//.test(templatePath) && templatePath !== "scripts/verify-status.sh")
  ) {
    return FILE_POLICIES.REPLACE_IF_UNMODIFIED;
  }
  return FILE_POLICIES.PROJECT_OWNED;
}
