#!/usr/bin/env python3
"""Repository-local documentation checks with no third-party dependencies."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
MARKDOWN_LINK = re.compile(r"!?\[[^\]]*\]\(([^)\n]+)\)")
INTERNAL_CITATION = re.compile(r"(?:filecite|cite)")
EXPECTED_H2_COUNTS = {
    "README.md": 11,
    "README.en.md": 11,
}
CRITICAL_TEMPLATE_FILES = (
    "templates/AGENTS.md",
    "templates/CLAUDE.md",
    "templates/ARCHITECTURE.md",
    "templates/BUILDBEAT.md",
    "templates/contracts/PROTOCOL.md",
    "templates/pm/NOW.md",
    "templates/pm/当期看板.md",
    "templates/pm/status/README.md",
    "templates/pm/adr/README.md",
    "templates/pm/adr/ADR-0000-template.md",
    "templates/standards/STACK.md",
    "templates/standards/CODE.md",
    "templates/standards/REVIEW.md",
    "templates/standards/DESIGN.md",
    "templates/.claude/agents/reviewer.md",
    "templates/scripts/bus-check.sh",
    "templates/scripts/pre-commit.sh",
    "templates/scripts/verify-status.sh",
    "templates/scripts/design-preview.sh",
    "templates/scripts/drift-check.sh",
)
CRITICAL_CLI_FILES = (
    ".github/scripts/publish-candidate.sh",
    ".github/workflows/publish.yml",
    "bin/buildbeat.js",
    "bin/solobaton.js",
    "docs/CLI.md",
    "docs/PHASE4-V1.20-PILOT-2026-08-25.md",
    "example/.buildbeat/manifest.json",
    "docs/RELEASING.md",
    "package-lock.json",
    "package.json",
    "src/cli.js",
    "src/constants.js",
    "src/doctor.js",
    "src/planner.js",
    "src/project.js",
    "src/upgrader.js",
    "src/writer.js",
    "tests/cli.test.js",
    "tests/publish-workflow.test.js",
    "tests/skill-only.test.sh",
    "tests/fixtures/healthy-default/expected-findings.json",
    "tests/fixtures/broken-now-pointer/expected-findings.json",
    "tests/fixtures/board-done-no-evidence/expected-findings.json",
    "tests/fixtures/gate-na-no-reason/expected-findings.json",
    "tests/fixtures/gate-na-ui-inconsistent/expected-findings.json",
    "tests/fixtures/gate-pass-untraceable/expected-findings.json",
    "tests/fixtures/gate-decision-valid/expected-findings.json",
    "tests/fixtures/gate-decision-line-missing/expected-findings.json",
    "tests/fixtures/gate-invalid/expected-findings.json",
    "tests/fixtures/evidence-valid/expected-findings.json",
    "tests/fixtures/evidence-outside-archive/expected-findings.json",
    "tests/fixtures/ghost-hash/expected-findings.json",
    "tests/fixtures/stale-now/expected-findings.json",
    "tests/fixtures/scan-truncated/expected-findings.json",
    "tests/fixtures/standards-partial/expected-findings.json",
    "tests/fixtures/standards-valid/expected-findings.json",
    "tests/fixtures/standards-draft/expected-findings.json",
    "tests/fixtures/standards-invalid/expected-findings.json",
    "tests/fixtures/stack-valid/expected-findings.json",
    "tests/fixtures/stack-conflict/expected-findings.json",
    "tests/fixtures/stack-unverified/expected-findings.json",
    "tests/fixtures/adr-valid/expected-findings.json",
    "tests/fixtures/adr-status-invalid/expected-findings.json",
    "tests/fixtures/adr-superseded-broken/expected-findings.json",
)
CRITICAL_GOVERNANCE_FILES = (
    ".github/CODEOWNERS",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/ISSUE_TEMPLATE/config.yml",
    ".github/ISSUE_TEMPLATE/feature_request.yml",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/dependabot.yml",
    ".github/workflows/codeql.yml",
    "CODE_OF_CONDUCT.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "docs/CHECKS.md",
    "docs/CAPABILITY-MATRIX.md",
    "docs/CLI-STRATEGY-2026-08.md",
    "docs/EXECUTION-PLAN.md",
    "docs/LEGACY-V1.16-MIGRATION.md",
    "docs/PHASE1-PILOT-2026-08-24.md",
    "docs/PHASE2-PILOT-PREFLIGHT-2026-08-25.md",
    "docs/PHASE2-PILOT-2026-08-25.md",
    "docs/PHASE2-BUILDBEAT-PILOT-2026-08-25.md",
    "docs/PHASE4-STABILITY-AUDIT-2026-08-25.md",
    "docs/V1.21-RELEASE-EVIDENCE-2026-08-25.md",
    "docs/ROADMAP.md",
    "docs/CLI-PILOT-2026-08-23.md",
)
CRITICAL_PLUGIN_FILES = (
    ".claude-plugin/marketplace.json",
    "plugins/buildbeat/.claude-plugin/plugin.json",
    "plugins/buildbeat/README.md",
    "tests/plugin-marketplace.test.sh",
)


def markdown_files() -> list[Path]:
    result = subprocess.run(
        [
            "git",
            "-c",
            "core.quotepath=false",
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "--",
            "*.md",
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    # During a staged or unstaged rename, --cached still reports the deleted
    # source path. Check only paths that exist in the candidate worktree while
    # keeping untracked replacement Markdown in scope.
    paths = {ROOT / relative for relative in result.stdout.splitlines()}
    return sorted(path for path in paths if path.is_file())


def link_target(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("<") and ">" in raw:
        return raw[1 : raw.index(">")]
    return raw.split(maxsplit=1)[0]


def check_relative_links(paths: list[Path]) -> list[str]:
    errors: list[str] = []
    ignored_prefixes = (
        "http://",
        "https://",
        "mailto:",
        "data:",
        "javascript:",
        "#",
    )

    for path in paths:
        text = path.read_text(encoding="utf-8")
        for match in MARKDOWN_LINK.finditer(text):
            target = link_target(match.group(1))
            if not target or target.startswith(ignored_prefixes):
                continue

            target = unquote(target.split("#", 1)[0].split("?", 1)[0])
            if not target:
                continue

            line = text.count("\n", 0, match.start()) + 1
            resolved = (path.parent / target).resolve()
            try:
                resolved.relative_to(ROOT)
            except ValueError:
                errors.append(
                    f"{path.relative_to(ROOT)}:{line}: link escapes repository: {target}"
                )
                continue
            if not resolved.exists():
                errors.append(
                    f"{path.relative_to(ROOT)}:{line}: missing link target: {target}"
                )
    return errors


def check_internal_citations(paths: list[Path]) -> list[str]:
    errors: list[str] = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        for match in INTERNAL_CITATION.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            errors.append(
                f"{path.relative_to(ROOT)}:{line}: non-portable internal citation marker"
            )
    return errors


def check_readme_shape() -> list[str]:
    errors: list[str] = []
    for filename, expected in EXPECTED_H2_COUNTS.items():
        path = ROOT / filename
        headings = [
            line for line in path.read_text(encoding="utf-8").splitlines()
            if line.startswith("## ")
        ]
        if len(headings) != expected:
            errors.append(
                f"{filename}: expected {expected} H2 sections, found {len(headings)}"
            )

    zh = (ROOT / "README.md").read_text(encoding="utf-8")
    en = (ROOT / "README.en.md").read_text(encoding="utf-8")
    required_pairs = (
        ("## 5 分钟开始", "## Start in five minutes"),
        ("## 核心机制", "## Core mechanisms"),
        ("## 适用边界", "## Applicability"),
        ("## 能力与依赖", "## Capabilities and dependencies"),
        ("## 贡献", "## Contributing"),
    )
    for zh_heading, en_heading in required_pairs:
        if zh_heading not in zh:
            errors.append(f"README.md: missing section {zh_heading}")
        if en_heading not in en:
            errors.append(f"README.en.md: missing section {en_heading}")

    required_boundary_pairs = (
        ("多人账号、角色/权限", "multi-user accounts, roles and permissions"),
        ("不采集或上传项目使用数据", "does not collect or upload project usage data"),
        ("遥测采集", "telemetry collection"),
    )
    for zh_boundary, en_boundary in required_boundary_pairs:
        if zh_boundary not in zh:
            errors.append(f"README.md: missing product boundary {zh_boundary}")
        if en_boundary not in en:
            errors.append(f"README.en.md: missing product boundary {en_boundary}")

    required_positioning_pairs = (
        ("面向人和 AI 会话", "for humans and AI sessions"),
        ("端到端工作包", "End-to-end work packages"),
        ("不是人类岗位接力", "not mandatory human-role handoffs"),
        ("Claude Code 插件：BuildBeat 仓库", "Claude Code plugin: BuildBeat repository"),
        (
            "/plugin install buildbeat@buildbeat-plugins",
            "/plugin install buildbeat@buildbeat-plugins",
        ),
        (
            "旧 `solobaton@latest` 固定在 legacy v0 只读能力",
            "The old `solobaton@latest` package stays on the legacy read-only v0 capability",
        ),
        ("BuildBeat 能力矩阵", "BuildBeat capability matrix"),
        ("真实 schema 2 版本增量试点", "genuine schema 2 version-increment pilot"),
        (
            "scoped BuildBeat 包承载完整有界生命周期",
            "the scoped BuildBeat package carries the bounded lifecycle",
        ),
        (
            "证据紧跟对应的已做事项",
            "evidence stays directly under the completed outcome it supports",
        ),
    )
    for zh_positioning, en_positioning in required_positioning_pairs:
        if zh_positioning not in zh:
            errors.append(f"README.md: missing scale-independent positioning {zh_positioning}")
        if en_positioning not in en:
            errors.append(
                f"README.en.md: missing scale-independent positioning {en_positioning}"
            )
    if "面向 Solo Builder" in zh:
        errors.append("README.md: stale solo-only audience positioning remains")
    if "for solo builders" in en:
        errors.append("README.en.md: stale solo-only audience positioning remains")
    return errors


def check_frontmatter() -> list[str]:
    errors: list[str] = []
    for relative in ("SKILL.md", "templates/.claude/agents/reviewer.md"):
        path = ROOT / relative
        lines = path.read_text(encoding="utf-8").splitlines()
        if not lines or lines[0] != "---":
            errors.append(f"{relative}: missing opening YAML frontmatter delimiter")
            continue
        try:
            end = lines.index("---", 1)
        except ValueError:
            errors.append(f"{relative}: missing closing YAML frontmatter delimiter")
            continue
        frontmatter = lines[1:end]
        for key in ("name:", "description:"):
            if not any(line.startswith(key) and line[len(key):].strip() for line in frontmatter):
                errors.append(f"{relative}: missing non-empty {key[:-1]} in frontmatter")
    return errors


def check_critical_files() -> list[str]:
    return [
        f"missing critical repository file: {relative}"
        for relative in (
            *CRITICAL_TEMPLATE_FILES,
            *CRITICAL_CLI_FILES,
            *CRITICAL_GOVERNANCE_FILES,
            *CRITICAL_PLUGIN_FILES,
        )
        if not (ROOT / relative).is_file()
    ]


def check_claude_plugin() -> list[str]:
    errors: list[str] = []
    marketplace_relative = ".claude-plugin/marketplace.json"
    manifest_relative = "plugins/buildbeat/.claude-plugin/plugin.json"
    marketplace_path = ROOT / marketplace_relative
    manifest_path = ROOT / manifest_relative

    try:
        marketplace = json.loads(marketplace_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"{marketplace_relative}: invalid JSON: {error}")
        marketplace = {}
    plugins = marketplace.get("plugins", [])
    if marketplace.get("name") != "buildbeat-plugins":
        errors.append(f"{marketplace_relative}: stable marketplace name is missing")
    if len(plugins) != 1:
        errors.append(f"{marketplace_relative}: expected exactly one plugin entry")
    elif plugins[0].get("name") != "buildbeat" or plugins[0].get("source") != (
        "./plugins/buildbeat"
    ):
        errors.append(
            f"{marketplace_relative}: buildbeat must route to ./plugins/buildbeat"
        )

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"{manifest_relative}: invalid JSON: {error}")
        manifest = {}
    if manifest.get("$schema") != (
        "https://json.schemastore.org/claude-code-plugin-manifest.json"
    ):
        errors.append(f"{manifest_relative}: official manifest schema URL is missing")
    if manifest.get("name") != "buildbeat":
        errors.append(f"{manifest_relative}: stable plugin name is missing")
    if re.fullmatch(r"\d+\.\d+\.\d+", manifest.get("version", "")) is None:
        errors.append(f"{manifest_relative}: plugin version must use three-part SemVer")
    if "skills" in manifest:
        errors.append(
            f"{manifest_relative}: root SKILL.md must remain the single auto-discovered skill"
        )

    plugin_root = ROOT / "plugins/buildbeat"
    expected_links = {
        "SKILL.md": "../../SKILL.md",
        "templates": "../../templates",
        "docs": "../../docs",
        "example": "../../example",
        "lessons.md": "../../lessons.md",
        "LICENSE": "../../LICENSE",
        "CHANGELOG.md": "../../CHANGELOG.md",
    }
    for relative, expected in expected_links.items():
        link = plugin_root / relative
        if not link.is_symlink():
            errors.append(f"plugins/buildbeat/{relative}: canonical link is missing")
            continue
        if str(link.readlink()) != expected:
            errors.append(
                f"plugins/buildbeat/{relative}: canonical link target must be {expected}"
            )
            continue
        try:
            link.resolve(strict=True).relative_to(ROOT)
        except (FileNotFoundError, ValueError):
            errors.append(
                f"plugins/buildbeat/{relative}: link target must exist inside marketplace root"
            )
    if (plugin_root / "bin").exists():
        errors.append("plugins/buildbeat: npm CLI bin must not enter the plugin boundary")
    return errors


def check_workflow_action_pins() -> list[str]:
    errors: list[str] = []
    for path in sorted((ROOT / ".github/workflows").glob("*.yml")):
        for line_number, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            match = re.match(r"\s*uses:\s+([^\s#]+)", line)
            if match is None:
                continue
            action = match.group(1)
            if action.startswith("./") or action.startswith("docker://"):
                continue
            reference = action.rsplit("@", 1)[-1] if "@" in action else ""
            if re.fullmatch(r"[0-9a-f]{40}", reference) is None:
                errors.append(
                    f"{path.relative_to(ROOT)}:{line_number}: external action must use an immutable full commit SHA"
                )
    return errors


def check_repository_governance() -> list[str]:
    errors: list[str] = []
    dependabot_relative = ".github/dependabot.yml"
    dependabot_path = ROOT / dependabot_relative
    dependabot = (
        dependabot_path.read_text(encoding="utf-8")
        if dependabot_path.is_file()
        else ""
    )
    dependabot_fragments = (
        "version: 2",
        "package-ecosystem: npm",
        "package-ecosystem: github-actions",
        "interval: weekly",
        "timezone: Asia/Singapore",
        "open-pull-requests-limit:",
    )
    for fragment in dependabot_fragments:
        if fragment not in dependabot:
            errors.append(f"{dependabot_relative}: missing dependency-update guard {fragment}")

    codeql_relative = ".github/workflows/codeql.yml"
    codeql_path = ROOT / codeql_relative
    codeql = codeql_path.read_text(encoding="utf-8") if codeql_path.is_file() else ""
    codeql_fragments = (
        "pull_request:",
        "push:",
        "schedule:",
        "security-events: write",
        "languages: javascript-typescript",
        "github/codeql-action/init@",
        "github/codeql-action/analyze@",
    )
    for fragment in codeql_fragments:
        if fragment not in codeql:
            errors.append(f"{codeql_relative}: missing CodeQL guard {fragment}")
    if "pull_request_target:" in codeql:
        errors.append(f"{codeql_relative}: pull_request_target must not execute repository code")

    security_path = ROOT / "SECURITY.md"
    security = security_path.read_text(encoding="utf-8") if security_path.is_file() else ""
    private_report_url = (
        "https://github.com/HaiYangBG1/BuildBeat/security/advisories/new"
    )
    if private_report_url not in security:
        errors.append("SECURITY.md: private vulnerability-reporting URL is missing")

    for forbidden in (
        "team/TEAM.md",
        "team/APPROVALS.md",
        "templates/team/TEAM.md",
        "templates/team/APPROVALS.md",
    ):
        if (ROOT / forbidden).exists():
            errors.append(f"{forbidden}: deleted team-management scope must not return")

    runbook = (ROOT / "docs/RELEASING.md").read_text(encoding="utf-8")
    for fragment in (
        "Protect release tags",
        "refs/tags/v*",
        "update",
        "deletion",
        "empty bypass list",
    ):
        if fragment not in runbook:
            errors.append(f"docs/RELEASING.md: missing release-tag guard {fragment}")
    return errors


def check_cli_package() -> list[str]:
    errors: list[str] = []
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")

    version = package.get("version", "")
    # Three-part SemVer with an optional pre-release tag (e.g. 2.0.0-beta.1):
    # the v2 plan ships beta versions on dist-tag next before latest moves.
    version_match = re.fullmatch(
        r"(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*))?", version
    )
    latest_match = re.search(
        r"^## v(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*))?",
        changelog,
        re.MULTILINE,
    )
    if version_match is None:
        errors.append("package.json: version must use three-part SemVer")
    elif latest_match is None:
        errors.append("CHANGELOG.md: latest release heading is missing")
    else:
        latest_version = ".".join(
            (latest_match.group(1), latest_match.group(2), latest_match.group(3) or "0")
        )
        if latest_match.group(4):
            latest_version += f"-{latest_match.group(4)}"
        if version != latest_version:
            errors.append(
                "package.json: version does not match the latest changelog release"
            )

    if lock.get("version") != version:
        errors.append("package-lock.json: root version does not match package.json")
    if package.get("name") != "@haiyangbg/buildbeat":
        errors.append("package.json: canonical scoped package name is stale")
    if lock.get("name") != "@haiyangbg/buildbeat":
        errors.append("package-lock.json: canonical scoped package name is stale")
    root_lock = lock.get("packages", {}).get("", {})
    if root_lock.get("name") != package.get("name") or root_lock.get("version") != version:
        errors.append("package-lock.json: root package identity does not match package.json")
    if package.get("bin", {}).get("buildbeat") != "bin/buildbeat.js":
        errors.append("package.json: buildbeat bin entry must point to bin/buildbeat.js")
    if package.get("bin", {}).get("solobaton") != "bin/solobaton.js":
        errors.append("package.json: solobaton bin entry must point to bin/solobaton.js")
    package_files = package.get("files", [])
    for required in ("docs/", "example/", "templates/", "lessons.md"):
        if required not in package_files:
            errors.append(f"package.json: published files must include {required}")
    if package.get("engines", {}).get("node") != ">=20":
        errors.append("package.json: supported Node floor must stay explicit at >=20")
    if package.get("dependencies") not in (None, {}):
        errors.append("package.json: BuildBeat must keep zero third-party runtime dependencies")
    if package.get("description") != (
        "BuildBeat: a Git-based, human-gated engineering delivery protocol for humans and AI sessions."
    ):
        errors.append("package.json: scale-independent product description is stale")
    keywords = set(package.get("keywords", []))
    if "solo-builder" in keywords or not {"delivery-protocol", "ai-sessions"}.issubset(
        keywords
    ):
        errors.append("package.json: product-positioning keywords are stale")
    publish_config = package.get("publishConfig", {})
    if publish_config.get("registry") != "https://registry.npmjs.org/":
        errors.append("package.json: publishConfig must pin the official npm registry")
    if publish_config.get("access") != "public":
        errors.append("package.json: publishConfig must keep the package public")
    prepublish = package.get("scripts", {}).get("prepublishOnly", "")
    for required in (
        "npm test",
        "npm run test:scripts",
        "npm run test:skill-only",
        "npm run test:plugin",
        "npm run check:docs",
        "npm run pack:check",
    ):
        if required not in prepublish:
            errors.append(f"package.json: prepublishOnly must include {required}")

    release_guide = (ROOT / "docs/RELEASING.md").read_text(encoding="utf-8")
    verified_match = re.search(
        r"latest independently verified BuildBeat npm distribution "
        r"`@haiyangbg/buildbeat@(\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?)`",
        release_guide,
    )
    verified_pending = (
        "latest independently verified BuildBeat npm distribution: "
        "**pending first scoped publication**"
    ) in release_guide
    verified_version = verified_match.group(1) if verified_match else ""
    if verified_match is None and not verified_pending:
        errors.append(
            "docs/RELEASING.md: scoped distribution evidence state is missing"
        )
    elif verified_match is not None and version_match is not None:
        # Compare on the numeric cores; pre-release suffixes never make a
        # verified distribution outrank the source package version.
        verified_core = re.match(r"(\d+)\.(\d+)\.(\d+)", verified_version)
        verified_parts = tuple(int(verified_core.group(i)) for i in (1, 2, 3))
        source_parts = tuple(int(version_match.group(i)) for i in (1, 2, 3))
        if verified_parts > source_parts:
            errors.append(
                "docs/RELEASING.md: verified npm distribution cannot exceed source package version"
            )
    if f"source package version `@haiyangbg/buildbeat@{version}`" not in release_guide:
        errors.append("docs/RELEASING.md: source package version evidence is stale")

    distribution_docs = ("README.md", "README.en.md", "docs/CLI.md")
    for relative in distribution_docs:
        content = (ROOT / relative).read_text(encoding="utf-8")
        required_commands = (
            "npm view @haiyangbg/buildbeat@latest version",
            "npx --yes --package=@haiyangbg/buildbeat@latest buildbeat",
            "npm install --global @haiyangbg/buildbeat@latest",
        )
        for command in required_commands:
            if command not in content:
                errors.append(
                    f"{relative}: missing evergreen npm package command {command}"
                )
        if "buildbeat doctor" not in content:
            errors.append(f"{relative}: missing canonical BuildBeat executable command")
        hard_coded_command = re.search(
            r"(?:--package=|--global\s+)@haiyangbg/buildbeat@\d+\.\d+\.\d+",
            content,
        )
        if hard_coded_command is not None:
            errors.append(
                f"{relative}: hard-coded executable package command will make the immutable npm README stale: {hard_coded_command.group(0)}"
            )
    cli_contract = (ROOT / "docs/CLI.md").read_text(encoding="utf-8")
    if f'"cliVersion": "{version}"' not in cli_contract:
        errors.append("docs/CLI.md: manifest example CLI version is stale")

    stale_distribution_claims = {
        "README.md": "尚未发布 npm",
        "README.en.md": "not published to npm yet",
    }
    for relative, stale_claim in stale_distribution_claims.items():
        if stale_claim in (ROOT / relative).read_text(encoding="utf-8"):
            errors.append(f"{relative}: stale npm publication claim remains")
    if not ((ROOT / "bin/buildbeat.js").stat().st_mode & 0o111):
        errors.append("bin/buildbeat.js: executable bit is missing")
    if not ((ROOT / "bin/solobaton.js").stat().st_mode & 0o111):
        errors.append("bin/solobaton.js: executable bit is missing")
    if not ((ROOT / ".github/scripts/publish-candidate.sh").stat().st_mode & 0o111):
        errors.append(".github/scripts/publish-candidate.sh: executable bit is missing")
    return errors


def check_execution_contracts() -> list[str]:
    errors: list[str] = []
    contracts = {
        "docs/CLI.md": (
            "legacy package `solobaton@1.16.3` remains the independently verified read-only v0",
            "`diff` and `uninstall` stay reserved",
            '"schemaVersion": 2',
            '"beginMarker": "# >>> buildbeat managed >>>"',
            "schema 2 rejects `three-way-only`",
            "In-process rollback is mandatory",
            "There is no project `uninstall` engine",
            "`git.not_initialized`",
        ),
        "docs/CHECKS.md": (
            "Status: **BuildBeat 1.20 / WP3.4 implementation baseline**",
            "INV-1",
            "INV-8",
            "`confirmed`",
            "`unverified`",
            "`sync.multirepo_drift`",
            "`gate.na_without_reason`",
            "`gate.na_inconsistent`",
            "`gate.invalid`",
            "pm/decisions.md:<positive-line-number>",
            "`evidence.missing`",
            "`evidence.outside_archive`",
            "`ref.broken`",
            "`standards.invalid`",
            "`standards.unconfirmed`",
            "`stack.drift`",
            "`stack.unverified`",
            "buildbeat-stack-baseline:v1",
            "BUS_STACK_MAX",
            "`adr.status_invalid`",
            "`adr.superseded_broken`",
            "`bus-check --format=json`",
            "Exit behavior:",
            "latest three dated rows",
            "buildbeat-multirepo-map:v1",
            "reason=limit",
            "reason=symlink",
            "reason=permission",
        ),
        "docs/EXECUTION-PLAN.md": (
            "按 schema 分开的 policy 校验集合",
            "不得把该策略迁移延后到 Wave 2",
            "本阶段不得再次迁移 policy",
            "`git.not_initialized`",
            "可变远端状态未来仍按发布 runbook 重新读回",
            "WP1.1–WP1.6 已完成",
            "WP0.1–WP4.3 已完成",
            "WP2.6 分发补强（候选完成）",
            "WP3.2 Gate/证据强关联（源码候选完成）",
            "WP3.3 多仓漂移（源码候选完成）",
            "WP3.4 边界报告完善（源码候选完成）",
            "WP4.1 示例全貌与 legacy 迁移（完成）",
            "WP4.2 能力矩阵、双语终校与硬门槛（完成）",
            "WP4.3 scoped 分发迁移（完成）",
            "WP4.3-RELEASE-EVIDENCE-2026-08-25.md",
            "buildbeat@buildbeat-plugins",
            "PHASE1-PILOT-2026-08-24.md",
            "PHASE2-PILOT-2026-08-25.md",
            "PHASE2-BUILDBEAT-PILOT-2026-08-25.md",
            "PHASE4-V1.20-PILOT-2026-08-25.md",
        ),
        "docs/PHASE1-PILOT-2026-08-24.md": (
            "source_state_unchanged",
            "sync.ghost_hash",
            "gate.na_without_reason",
            "Git 可见状态不变",
        ),
        "docs/PHASE2-PILOT-PREFLIGHT-2026-08-25.md": (
            "writesPerformed=false",
            "partial default layout",
            "15 个可见变更",
            "仍需点名并授权的三个目标",
            "默认不授权 push、merge、tag",
        ),
        "docs/PHASE2-PILOT-2026-08-25.md": (
            "real-directory write pilot",
            "git.not_initialized",
            "5aef3e87290068388e8b8f218daa1d4abaed3e2d9d7251a8c37b6defb8b0cb18",
            "31bd73f175152a312f56c77a0d9bcd61b597a9a4ac07c75a3d747f32aa19e91c",
            "hasUi=true",
            "command_not_available",
            "eb27a88663701ea03de776e32b6a23c2d1e3ac28",
            "5b6aa726a1722226f9651a14bf0fb8fa36a5f9f6",
            "b63383db9e56f17495a8ccc8edcb81e7c9cf24f0",
        ),
        "docs/PHASE2-BUILDBEAT-PILOT-2026-08-25.md": (
            "BuildBeat namespace real-directory pilot",
            "WP2.8 Gate3 已由用户确认",
            "a1a23c1e1abbd23ff248a1f782c9b5e7c1ddefa251bef7ff1da617014894e827",
            "31bd73f175152a312f56c77a0d9bcd61b597a9a4ac07c75a3d747f32aa19e91c",
            "bb5cf55a2f099ce96f941473af3bd7d452fe1aad",
            "f181e3e5759ac692eed96f055111f05d49f7dd3d",
            "84261c935eb6cda724e9840888e02fcce51a1b84",
            "9cfda12cc3225db2e75ccd5990bb7d1df7f0359b",
            "8ed14e83b43b8d960faad343d13b7aa8ea56dced",
            "bd7fb59f9a99c4428377081cba25b294e30f685c",
            "4ea29a94a3a29fa905ae99662359ec561298135d",
            "69d6e8358f7fda03225c090d99b5647cae152183",
            "6b32c53e4fd750770690a0bbe796638314cb792a",
        ),
        "docs/PHASE4-V1.20-PILOT-2026-08-25.md": (
            "a136ff6f33d5814d36593f85a3b9ec2f1e223827",
            "schema `2`，scaffold `v1.16`，CLI `1.16.3`",
            "scaffold `v1.20` / CLI `1.20.0`",
            "`main...HEAD` 的 diff 行数为 `0`",
            "Shell 套件为 `222/222`",
            "`pm/NOW.md` 引用根内不存在的 `lessons.md`",
            "原仓零写入、零 stage、零 commit",
            "不可外推",
        ),
        "docs/CAPABILITY-MATRIX.md": (
            "三组生命周期入口",
            "Skill-only / 手工路径",
            "legacy `solobaton@1.16.3`",
            "BuildBeat `@haiyangbg/buildbeat@1.21.0`",
            "Skill-only → CLI `doctor`",
            "CLI `init/adopt` → Skill-only",
            "CLI `upgrade` → Skill-only",
            "Legacy npm v0",
            "BuildBeat 1.21",
            "Project runtime",
        ),
        "docs/LEGACY-V1.16-MIGRATION.md": (
            "A. 继续 legacy 手工维护",
            "B. 受控重建 schema 2 基线",
            "不得手写 manifest",
            "example/.buildbeat/manifest.json",
            "本流程不授权部署、push、tag、GitHub Release、npm publish 或远端改名",
            "不用破坏性 reset",
        ),
        "docs/ROADMAP.md": (
            "2026-08-24 执行修订（生效）",
            "[`EXECUTION-PLAN.md`](EXECUTION-PLAN.md)",
            "一个 Builder 对一个工作包端到端负责",
            "真实 schema 2 `v1.16 → v1.20` upgrade",
            "WP4.1–WP4.2",
            "WP4.3 scoped package、新仓库名与 `1.20.0` 外部分发已关闭",
            "13. [x] 完成远端改名",
            "WP4.3-RELEASE-EVIDENCE-2026-08-25.md",
        ),
        "docs/WP4.3-RELEASE-EVIDENCE-2026-08-25.md": (
            "5aaa9e8ec96113970e7ce0ed0e43bec86a8743a0",
            "32826832379",
            "include=`refs/tags/v*`",
            "rules=`update,deletion`",
            '"bootstrap": "0.0.0"',
            '"latest": "1.20.0"',
            "sha512-Q9hcRNSwuhYulNR7+XxAyILSmujzhj01tDqHR+C8RgROSdP99O/oAhZgSpiHW441jdvCWPmnl4yDvtQGpfffUg==",
            "1 个 verified registry signature",
            "1 个 verified attestation",
            "Git 可见状态完全一致",
            "registry README",
            "Require two-factor authentication and disallow bypass 2fa tokens (recommended)",
            "1.16.1",
            "1.16.2",
            "1.16.3",
            "不证明任何业务项目 Gate、部署、生产健康或常态流量",
        ),
        "docs/V1.21-RELEASE-EVIDENCE-2026-08-25.md": (
            "ce69a05c8a42b9ac8d3cafbc4ed224f0bbf71a63",
            "78031f68a8c16f0ef7c3bb9daceda19431db34cb",
            "32864194006",
            "32864196001",
            "32864438692",
            "include=`refs/tags/v*`",
            "rules=`update,deletion`",
            "latest=1.21.0",
            "sha512-P9HluoPvb6/HJhh2IP3VLG3ig6kQ4aJKtkZeowcU6Virv9vGxgvulMnq9J7XN5dQNtcwaUZhfgLKR/Qi93e+wA==",
            "1 个 verified registry signature",
            "1 个 verified attestation",
            "writesPerformed=false",
            "Git 可见状态完全一致",
            "不证明任何业务项目的 Gate、部署、生产健康或常态流量",
        ),
        "SKILL.md": (
            "一个或多个端到端 Builder",
            "不是人类岗位流水线",
            "工作包所有权与 AI 专业视角",
            "四个仪式",
            "开工同步(7 步)",
            "执行中同步(5 守则)",
            "收工同步(7 步)",
            "### 6.4 域回复格式",
            "我继续做，暂不交棒",
            "可选规范默认不生成",
            "历史债务与接管边界",
            "pendingPlaceholders",
            "`--yes` 只复用这次确认",
            "schema 2 机械 upgrade",
            "`pm/decisions.md:<行号>`",
            "buildbeat-multirepo-map:v1",
            "检查结果怎么读",
            "coverage.complete=false",
            "docs/CAPABILITY-MATRIX.md",
        ),
        "templates/指挥台.md": (
            "## 域回复怎么写",
            "共同证据",
            "检查结果怎么读",
            "reason=limit|symlink|permission",
            "coverage.complete=false",
        ),
        "templates/AGENTS.md": (
            "Builder 端到端负责",
            "不是人类岗位或审批链",
            "开工/收工护栏",
            "**域回复格式**",
            "下一棒是",
            "standards/DESIGN.md",
            "buildbeat-multirepo-map:v1",
        ),
        "templates/pm/当期看板.md": (
            "- **证据**:",
            "- Gate1: pending",
            "- Gate2: pending",
            "- Gate3: pending",
            "- Gate4: pending",
            "pm/decisions.md:<行号>",
        ),
        "templates/pm/NOW.md": (
            "`contracts/PROTOCOL.md`",
        ),
        "templates/contracts/PROTOCOL.md": (
            "buildbeat-multirepo-map:v1",
            "repo=<代码子仓1>|contract=contracts/PROTOCOL.md|deployment=<bus-baseline.json app 名或 n/a>",
        ),
        "templates/scripts/bus-check.sh": (
            "--format=json",
            'add_finding "gate.na_without_reason"',
            'add_finding "gate.na_inconsistent"',
            'add_finding "sync.multirepo_drift"',
            'add_finding "evidence.missing"',
            'add_finding "evidence.outside_archive"',
            'add_finding "sync.scan_truncated"',
            'add_finding "standards.invalid"',
            'add_finding "stack.drift"',
            'add_finding "stack.unverified"',
            'add_finding "adr.status_invalid"',
            "render_json_report",
        ),
        "src/constants.js": (
            'OPTIONAL_TEMPLATE_PREFIXES = ["standards/", "pm/adr/"]',
            '"standards/STACK.md"',
            '"pm/adr/ADR-0000-template.md"',
            "OUTPUT_SCHEMA_VERSION = 2",
            "MANIFEST_SCHEMA_VERSION = 2",
            'GITIGNORE_BEGIN_MARKER = "# >>> buildbeat managed >>>"',
            '"<bus-baseline.json app 名或 n/a>"',
            'LEGACY_GITIGNORE_BEGIN_MARKER = "# >>> solobaton managed >>>"',
        ),
        "src/cli.js": (
            'token === "--yes"',
            'token === "--force"',
            "applyScaffold(plan, { now })",
            "applyUpgrade(plan, { now })",
            'code: "confirmation_required"',
        ),
        "src/upgrader.js": (
            "export function buildUpgradePlan",
            "export function applyUpgrade",
            "function preflightExpectations",
            "function rollback",
            'command: "upgrade"',
        ),
        "src/writer.js": (
            "function atomicWrite",
            "function rollback",
            "schemaVersion: MANIFEST_SCHEMA_VERSION",
            "faultInjector",
        ),
        "templates/standards/CODE.md": (
            "**Optional**",
            "**AI write boundary**",
            "**Status**: Draft",
            "CODE-MUST-001",
            "Secret",
        ),
        "templates/standards/STACK.md": (
            "**Optional**",
            "**AI write boundary**",
            "**Status**: Draft",
            "buildbeat-stack-baseline:v1",
            "nodeConstraint=",
            "lockfileKind=",
            "dockerFromImage=",
        ),
        "templates/pm/adr/README.md": (
            "Proposed / Accepted / Rejected / Superseded",
            "推翻或替代此前 ADR",
        ),
        "templates/scripts/verify-status.sh": (
            "--format=machine",
            'emit_machine_finding "sync.l3_stale"',
            'emit_machine_finding "sync.l3_unconfigured"',
        ),
        "tests/README.md": (
            "expectedCoverageComplete",
            "registered code/level pairs",
            "plugin-marketplace.test.sh",
            "isolated config/cache directories",
            "both interoperability directions",
        ),
        ".claude-plugin/marketplace.json": (
            '"name": "buildbeat-plugins"',
            '"source": "./plugins/buildbeat"',
        ),
        "plugins/buildbeat/.claude-plugin/plugin.json": (
            '"name": "buildbeat"',
            '"version": "0.2.1"',
            '"repository": "https://github.com/HaiYangBG1/BuildBeat"',
            "claude-code-plugin-manifest.json",
        ),
        "plugins/buildbeat/README.md": (
            "canonical files at the marketplace root",
            "/buildbeat:buildbeat",
        ),
        "example/pm/一期-看板.md": (
            "- Gate1: passed",
            "- Gate4: passed",
            "- **证据**:",
        ),
        "example/README.md": (
            "- Gate1: pending",
            "- Gate2: passed",
            "- Gate3: blocked",
            "- Gate4: n/a",
            "Manifest 的教学边界",
            "## 域回复示例",
            "下一棒是测试视角",
        ),
        "lessons.md": (
            "## 19. 域回复各说各话",
            "已做 → 未做 → 下一步",
        ),
    }
    for relative, fragments in contracts.items():
        content = (ROOT / relative).read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in content:
                errors.append(f"{relative}: missing execution contract guard {fragment}")

    cli_contract = (ROOT / "docs/CLI.md").read_text(encoding="utf-8")
    for stale in (
        "both changed → conflict with a three-way diff artifact",
        "`uninstall --dry-run` will",
        "render project facts with no canonical placeholders remaining",
    ):
        if stale in cli_contract:
            errors.append(f"docs/CLI.md: superseded lifecycle contract remains: {stale}")
    stale_phase0_claims = {
        "docs/CHECKS.md": "implements only the legacy subset",
        "tests/README.md": "Phase 0 bridge contract",
    }
    for relative, stale in stale_phase0_claims.items():
        if stale in (ROOT / relative).read_text(encoding="utf-8"):
            errors.append(f"{relative}: stale Phase 0 implementation claim remains")
    return errors


def bundled_scaffold_version() -> str | None:
    """The frozen scaffold bundle version pinned in src/constants.js."""
    constants = (ROOT / "src/constants.js").read_text(encoding="utf-8")
    match = re.search(r'export const SCAFFOLD_VERSION = "(v\d+\.\d+)"', constants)
    return match.group(1) if match else None


def check_example_version() -> list[str]:
    # The teaching example tracks the scaffold content bundle, which is frozen
    # independently of the (now v2) package version.
    scaffold_version = bundled_scaffold_version()
    example = (ROOT / "example/BUILDBEAT.md").read_text(encoding="utf-8")
    example_match = re.search(r"本项目使用 BuildBeat `(v\d+\.\d+)`", example)
    if scaffold_version is None:
        return ["src/constants.js: SCAFFOLD_VERSION must be a pinned v<major>.<minor> literal"]
    if example_match is None:
        return ["example/BUILDBEAT.md: no installed version found"]
    if scaffold_version != example_match.group(1):
        return [
            "example/BUILDBEAT.md: installed version "
            f"{example_match.group(1)} does not match the bundled scaffold {scaffold_version}"
        ]
    return []


def check_example_manifest() -> list[str]:
    errors: list[str] = []
    relative = "example/.buildbeat/manifest.json"
    path = ROOT / relative
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return [f"{relative}: invalid JSON: {error}"]

    expected_top_level = {
        "schemaVersion",
        "scaffoldVersion",
        "cliVersion",
        "layout",
        "installedAt",
        "files",
        "integrations",
    }
    if set(manifest) != expected_top_level:
        errors.append(f"{relative}: top-level fields do not match schema 2")

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    cli_version = package.get("version")
    scaffold_version = bundled_scaffold_version()
    if manifest.get("schemaVersion") != 2:
        errors.append(f"{relative}: teaching manifest must use schema 2")
    if manifest.get("cliVersion") != cli_version:
        errors.append(f"{relative}: cliVersion must match package.json")
    if manifest.get("scaffoldVersion") != scaffold_version:
        errors.append(f"{relative}: scaffoldVersion must match the source bundle")
    if manifest.get("layout") != "default":
        errors.append(f"{relative}: teaching snapshot must use default layout")
    if re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z",
        str(manifest.get("installedAt", "")),
    ) is None:
        errors.append(f"{relative}: installedAt must be a canonical UTC timestamp")

    marker = (ROOT / "example/BUILDBEAT.md").read_text(encoding="utf-8")
    marker_match = re.search(r"本项目使用 BuildBeat `(v\d+\.\d+)`", marker)
    if marker_match is None or marker_match.group(1) != manifest.get("scaffoldVersion"):
        errors.append(f"{relative}: scaffoldVersion must match example/BUILDBEAT.md")

    expected_files = {
        "AGENTS.md": "replace-if-unmodified",
        "ARCHITECTURE.md": "project-owned",
        "BUILDBEAT.md": "replace-if-unmodified",
        "CLAUDE.md": "replace-if-unmodified",
        "contracts/PROTOCOL.md": "project-owned",
        "pm/NOW.md": "project-owned",
        "pm/decisions.md": "project-owned",
        "pm/一期-看板.md": "project-owned",
    }
    files = manifest.get("files")
    if not isinstance(files, dict):
        errors.append(f"{relative}: files must be an object")
        files = {}
    if set(files) != set(expected_files):
        errors.append(f"{relative}: teaching inventory must contain the documented 8 paths")
    for project_relative, policy in expected_files.items():
        record = files.get(project_relative)
        if not isinstance(record, dict) or set(record) != {"policy", "baselineSha256"}:
            errors.append(f"{relative}: invalid file record for {project_relative}")
            continue
        if record.get("policy") != policy:
            errors.append(f"{relative}: wrong policy for {project_relative}")
        target = ROOT / "example" / project_relative
        if not target.is_file() or target.is_symlink():
            errors.append(f"{relative}: baseline target must be a regular file: {project_relative}")
            continue
        actual_hash = hashlib.sha256(target.read_bytes()).hexdigest()
        if record.get("baselineSha256") != actual_hash:
            errors.append(f"{relative}: stale baselineSha256 for {project_relative}")

    if manifest.get("integrations") != {"gitignore": None, "hooks": None}:
        errors.append(f"{relative}: teaching integrations must keep gitignore/hooks null")

    readme = (ROOT / "example/README.md").read_text(encoding="utf-8")
    for fragment in (
        "合成教学快照",
        "不得复制本 manifest",
        "这不是可用 `doctor` 证明健康的完整 CLI 安装",
    ):
        if fragment not in readme:
            errors.append(f"example/README.md: missing manifest evidence boundary {fragment}")
    return errors


def check_phase4_audit() -> list[str]:
    errors: list[str] = []
    relative = "docs/PHASE4-STABILITY-AUDIT-2026-08-25.md"
    audit = (ROOT / relative).read_text(encoding="utf-8")
    statuses: dict[int, str] = {}
    for gate in range(1, 13):
        match = re.search(
            rf"^\| {gate} \| `\[([x ])\]` \|",
            audit,
            re.MULTILINE,
        )
        if match is None:
            errors.append(f"{relative}: missing unique checkbox row for roadmap gate {gate}")
            continue
        statuses[gate] = match.group(1)

    for gate in range(1, 13):
        if gate in statuses and statuses[gate] != "x":
            errors.append(f"{relative}: roadmap gate {gate} has an unexpected status")
    for fragment in (
        "12 条源码/真实试点候选口径与后续 scoped 外部分发证据均已闭合",
        "真实 schema 2 `v1.16 → v1.20` upgrade",
        "WP4.3 外部分发均已关闭",
        "WP4.3-RELEASE-EVIDENCE-2026-08-25.md",
    ):
        if fragment not in audit:
            errors.append(f"{relative}: missing hard-gate evidence boundary {fragment}")
    return errors


def check_publish_workflow() -> list[str]:
    errors: list[str] = []
    relative = ".github/workflows/publish.yml"
    workflow = (ROOT / relative).read_text(encoding="utf-8")
    helper_relative = ".github/scripts/publish-candidate.sh"
    helper = (ROOT / helper_relative).read_text(encoding="utf-8")
    required_fragments = (
        "workflow_dispatch:",
        "name: npm-publish",
        "id-token: write",
        "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
        "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
        "npm install --global npm@11.19.0",
        # Channel-aware ancestry guard: stable releases stay pinned to main;
        # pre-releases must sit on the exact origin tip of the dispatching
        # release branch and are forced onto dist-tag next.
        'test "$dispatch_branch" = "main"',
        'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',
        'test "$(git rev-parse HEAD)" = "$(git rev-parse "refs/remotes/origin/$dispatch_branch")"',
        'dist_tag=next',
        "bash .github/scripts/publish-candidate.sh",
        "needs: publish",
        "dist.attestations.url",
        "https://slsa.dev/provenance/v1",
        "npm audit signatures",
        '@haiyangbg/buildbeat',
        'encoded_package="${package_name/\\//%2f}"',
    )
    for fragment in required_fragments:
        if fragment not in workflow:
            errors.append(f"{relative}: missing trusted-publishing guard {fragment}")
    if "NODE_AUTH_TOKEN" in workflow or "NPM_TOKEN" in workflow:
        errors.append(f"{relative}: long-lived npm publish token must not be configured")
    if workflow.count("id-token: write") != 1:
        errors.append(f"{relative}: exactly one publish job may receive id-token: write")

    action_refs = re.findall(
        r"uses:\s+actions/(?:checkout|setup-node)@([^\s]+)", workflow
    )
    if not action_refs or any(
        re.fullmatch(r"[0-9a-f]{40}", reference) is None for reference in action_refs
    ):
        errors.append(f"{relative}: publish workflow actions must use immutable full SHAs")

    helper_fragments = (
        'official_registry="https://registry.npmjs.org/"',
        'BUILDBEAT_PACKAGE_NAME:-@haiyangbg/buildbeat',
        "registry_integrity",
        'npm publish "$candidate_tarball" --access public',
        '[[ "$existing_integrity" == "$candidate_integrity" ]]',
        "registry reconciliation proved the exact candidate",
    )
    for fragment in helper_fragments:
        if fragment not in helper:
            errors.append(f"{helper_relative}: missing publish recovery guard {fragment}")
    if "NODE_AUTH_TOKEN" in helper or "NPM_TOKEN" in helper:
        errors.append(f"{helper_relative}: long-lived npm publish token must not be configured")
    return errors


def main() -> int:
    paths = markdown_files()
    errors = []
    errors.extend(check_relative_links(paths))
    errors.extend(check_internal_citations(paths))
    errors.extend(check_readme_shape())
    errors.extend(check_frontmatter())
    errors.extend(check_critical_files())
    errors.extend(check_claude_plugin())
    errors.extend(check_cli_package())
    errors.extend(check_execution_contracts())
    errors.extend(check_example_version())
    errors.extend(check_example_manifest())
    errors.extend(check_phase4_audit())
    errors.extend(check_publish_workflow())
    errors.extend(check_workflow_action_pins())
    errors.extend(check_repository_governance())

    if errors:
        print("Documentation checks failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"Documentation checks passed: {len(paths)} Markdown files, "
        "relative links, bilingual README shape, frontmatter, critical files, example manifest hashes, phase-4 hard-gate status, CLI package metadata, and repository governance."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
