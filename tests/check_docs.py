#!/usr/bin/env python3
"""Repository-local documentation checks with no third-party dependencies."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
MARKDOWN_LINK = re.compile(r"!?\[[^\]]*\]\(([^)\n]+)\)")
INTERNAL_CITATION = re.compile(r"(?:filecite|cite)")
# Documents users read today. History (release evidence, iteration records,
# plans, RFC bodies) is exempt: it must keep the facts of its own date.
ACTIVE_DOCS = (
    "README.md",
    "README.en.md",
    "SKILL.md",
    "CONTRIBUTING.md",
    "lessons.md",
    "docs/README.md",
    "docs/CAPABILITY-MATRIX.md",
    "docs/RELEASING.md",
    "docs/v2/guide/README.md",
    "docs/v2/guide/00-how-to-talk.md",
    "docs/v2/guide/01-quickstart.md",
    "docs/v2/guide/01-quickstart.en.md",
    "docs/v2/guide/02-workflow-guide.md",
    "docs/v2/guide/03-policy-guide.md",
    "docs/v2/guide/04-adapter-guide.md",
    "docs/v2/guide/05-worker-contract.md",
    "docs/v2/guide/06-evidence-guide.md",
    "docs/v2/guide/06-evidence-guide.en.md",
    "docs/v2/guide/07-approval-guide.md",
    "docs/v2/guide/07-approval-guide.en.md",
    "docs/v2/guide/09-security-boundaries.md",
    "docs/v2/guide/10-recovery.md",
    "docs/v2/guide/10-recovery.en.md",
    "docs/v2/guide/11-session-handoff.md",
    "docs/v2/guide/11-session-handoff.en.md",
    "templates/v2/AGENTS.md",
    "templates/v2/指挥台.md",
    "templates/v2/BUILDBEAT.md",
    "templates/v2/CLAUDE.md",
    "templates/ARCHITECTURE.md",
    "templates/pm/decisions.md",
    "templates/pm/adr/README.md",
    "templates/pm/adr/ADR-0000-template.md",
    "templates/contracts/PROTOCOL.md",
    "templates/standards/STACK.md",
    "templates/standards/CODE.md",
    "templates/standards/REVIEW.md",
    "templates/standards/DESIGN.md",
    "plugins/buildbeat/README.md",
    "tests/README.md",
    "example/README.md",
    "example/AGENTS.md",
    "example/指挥台.md",
    "example/BUILDBEAT.md",
    "example/pm/decisions.md",
    "example/delivery/work/WORK-EXPORT-DATE-FILTER/intent.md",
    "example/delivery/work/WORK-EXPORT-DATE-FILTER/plan.md",
)
# Claims that were true once and are wrong today, plus contract wording the
# parser rejects. Each entry: (regex, what it means). Found in an active doc =
# failure. The v1 family of patterns exists because 3.0.0 removed the v1
# file bus and lifecycle CLI: active documents describe one product.
STALE_ACTIVE_CLAIMS = (
    (r"npm (?:i|install)(?: -g| --global)? @haiyangbg/buildbeat@next", "installs the pre-release channel as the default"),
    (r"Beta 期 `latest`|`latest` 仍指向 v1|latest 仍是 v1|latest is still v1|latest stays v1|装 beta", "says latest is still v1"),
    (r"severity: \"P1\|P2\|P3\", title", "worker finding schema uses `title` / omits P0"),
    (r"P1/P2 会触发 `findings-blocking`", "says P2 blocks (only P0/P1 block)"),
    (r"被任意会话自动装载|每个 session 一开就自动读", "claims every tool auto-loads AGENTS.md"),
    (r"批准即 merge-ready|批准=merge-ready|批准仅表示 merge-ready", "flattens every approval into merge-ready"),
    (r"buildbeat-v2", "names the removed `buildbeat-v2` executable (the runtime is `buildbeat`)"),
    (r"(?i)solobaton", "names the retired Solobaton name or executable"),
    (r"(?<![A-Za-z0-9./-])(?<!SLSA )v1(?![A-Za-z0-9.])", "refers to the removed v1 generation"),
    (r"pm/NOW\.md|当期看板|pm/status/|pm/changes/|bus-check|verify-status\.sh|drift-check\.sh|design-preview\.sh|pre-commit\.sh", "refers to the removed file bus"),
    (r"legacy-four-gates|四 Gate|四个 Gate|Gate[1-4]\b|三轨", "refers to the removed fixed-gate cadence"),
    (r"buildbeat (?:init|adopt|upgrade)\b|`init/adopt|schema 2 manifest|SCAFFOLD_VERSION", "refers to the removed lifecycle CLI"),
)

CRITICAL_TEMPLATE_FILES = (
    "templates/ARCHITECTURE.md",
    "templates/gitignore.template",
    "templates/contracts/PROTOCOL.md",
    "templates/pm/decisions.md",
    "templates/pm/adr/README.md",
    "templates/pm/adr/ADR-0000-template.md",
    "templates/standards/STACK.md",
    "templates/standards/CODE.md",
    "templates/standards/REVIEW.md",
    "templates/standards/DESIGN.md",
    "templates/v2/AGENTS.md",
    "templates/v2/CLAUDE.md",
    "templates/v2/BUILDBEAT.md",
    "templates/v2/指挥台.md",
    "templates/v2/run-config.example.yaml",
    "templates/v2/envelope/worker.sh",
    "templates/v2/envelope/prompts/builder.md",
    "templates/v2/envelope/prompts/reviewer.md",
    "templates/v2/envelope/prompts/fixer.md",
    "example/README.md",
    "example/AGENTS.md",
    "example/delivery/work/WORK-EXPORT-DATE-FILTER/run-config.yaml",
    "example/delivery/work/WORK-EXPORT-DATE-FILTER/runs/RUN-EXPORT-01/run-record.json",
    "example/delivery/work/WORK-EXPORT-DATE-FILTER/decisions.jsonl",
    "tests/example-firstrun.test.js",
)
CRITICAL_CLI_FILES = (
    ".github/scripts/publish-candidate.sh",
    ".github/workflows/publish.yml",
    "bin/buildbeat.js",
    "docs/RELEASING.md",
    "package-lock.json",
    "package.json",
    "src/v2/cli/run.js",
    "src/v2/presets/software-delivery.yaml",
    "tests/publish-workflow.test.js",
    "tests/pack-firstrun.test.sh",
    "tests/v2-templates-firstrun.test.js",
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
    "docs/CAPABILITY-MATRIX.md",
    "docs/v2/RFC-0001-product-definition.md",
    "docs/v2/RFC-0002-domain-model.md",
    "docs/v2/RFC-0003-workflow-policy.md",
    "docs/v2/SPEC-0001-events-v1.md",
)
CRITICAL_PLUGIN_FILES = (
    ".claude-plugin/marketplace.json",
    "plugins/buildbeat/.claude-plugin/plugin.json",
    "plugins/buildbeat/README.md",
    "tests/plugin-marketplace.test.sh",
)
REMOVED_PATHS = (
    "bin/buildbeat-v2.js",
    "bin/solobaton.js",
    "src/cli.js",
    "src/constants.js",
    "src/upgrader.js",
    "docs/CLI.md",
    "docs/CHECKS.md",
    "docs/LEGACY-V1.16-MIGRATION.md",
    "docs/v2/guide/08-migration-v1.md",
    "templates/AGENTS.md",
    "templates/pm/NOW.md",
    "templates/scripts",
    "templates/.claude",
    "tests/cli.test.js",
    "tests/test-scripts.sh",
    "tests/skill-only.test.sh",
    "tests/fixtures",
    "team/TEAM.md",
    "team/APPROVALS.md",
    "templates/team/TEAM.md",
    "templates/team/APPROVALS.md",
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
        if path.name == "CHANGELOG-v1.md":
            # Archived verbatim; it names the marker while describing this check.
            continue
        text = path.read_text(encoding="utf-8")
        for match in INTERNAL_CITATION.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            errors.append(
                f"{path.relative_to(ROOT)}:{line}: non-portable internal citation marker"
            )
    return errors


def check_readme_shape() -> list[str]:
    errors: list[str] = []
    zh = (ROOT / "README.md").read_text(encoding="utf-8")
    en = (ROOT / "README.en.md").read_text(encoding="utf-8")
    # Keep translations aligned, without freezing marketing copy or titles.
    zh_sections = re.findall(r"^## .+$", zh, re.MULTILINE)
    en_sections = re.findall(r"^## .+$", en, re.MULTILINE)
    if not zh_sections or len(zh_sections) != len(en_sections):
        errors.append("README translations must have matching section counts")
    for language in ("bash", "text"):
        pattern = rf"```{language}\n(.*?)```"
        if re.findall(pattern, zh, re.DOTALL) != re.findall(pattern, en, re.DOTALL):
            errors.append(f"README translations have different {language} examples")

    # A homepage must lead to usable instructions and disclose the local
    # runtime boundary; links are checked for existence elsewhere.
    for filename, content, suffix in (
        ("README.md", zh, ".md"),
        ("README.en.md", en, ".en.md"),
    ):
        targets = set(MARKDOWN_LINK.findall(content))
        for target in (
            "SKILL.md", f"docs/v2/guide/01-quickstart{suffix}", f"docs/v2/guide/11-session-handoff{suffix}",
            "docs/CAPABILITY-MATRIX.md", f"docs/v2/guide/10-recovery{suffix}",
            "docs/v2/guide/09-security-boundaries.md", "CONTRIBUTING.md", "LICENSE",
        ):
            if target not in targets:
                errors.append(f"{filename}: missing user entry point {target}")
        for boundary in (".buildbeat/runtime/", ".buildbeat/worktrees/"):
            if boundary not in content:
                errors.append(f"{filename}: missing local execution boundary {boundary}")

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
        (
            "/plugin install buildbeat@buildbeat-plugins",
            "/plugin install buildbeat@buildbeat-plugins",
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
    for relative in ("SKILL.md",):
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
    errors = [
        f"missing critical repository file: {relative}"
        for relative in (
            *CRITICAL_TEMPLATE_FILES,
            *CRITICAL_CLI_FILES,
            *CRITICAL_GOVERNANCE_FILES,
            *CRITICAL_PLUGIN_FILES,
        )
        if not (ROOT / relative).is_file()
    ]
    errors.extend(
        f"{relative}: removed scope must not return"
        for relative in REMOVED_PATHS
        if (ROOT / relative).exists()
    )
    return errors


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

    runbook = (ROOT / "docs/RELEASING.md").read_text(encoding="utf-8")
    for fragment in (
        "Protect release tags",
        "refs/tags/v*",
        "update",
        "deletion",
        "empty bypass list",
        "## Channels and branches",
        "## Post-release synchronization checklist",
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
    # Three-part SemVer with an optional pre-release tag (e.g. 3.0.0-beta.1):
    # pre-releases ship on dist-tag next before latest moves.
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
    if package.get("bin") != {"buildbeat": "bin/buildbeat.js"}:
        errors.append("package.json: the only executable is buildbeat -> bin/buildbeat.js")
    package_files = package.get("files", [])
    for required in ("bin/", "src/", "docs/", "example/", "templates/", "SKILL.md", "lessons.md", "CHANGELOG.md"):
        if required not in package_files:
            errors.append(f"package.json: published files must include {required}")
    if package.get("engines", {}).get("node") != ">=20":
        errors.append("package.json: supported Node floor must stay explicit at >=20")
    if package.get("dependencies") not in (None, {}):
        errors.append("package.json: BuildBeat must keep zero third-party runtime dependencies")
    description = package.get("description", "")
    if not description.startswith("BuildBeat") or not 40 <= len(description) <= 300:
        errors.append("package.json: description must start with BuildBeat and stay between 40 and 300 characters")
    if re.search(r"solo|one-person|for humans only", description, re.IGNORECASE):
        errors.append("package.json: description carries a scale-dependent audience claim")
    if "human" not in description.lower():
        errors.append("package.json: description must name the human decision point")
    keywords = set(package.get("keywords", []))
    if keywords & {"solo-builder", "one-person-company"}:
        errors.append("package.json: scale-dependent audience keywords are stale")
    if not keywords & {"ai-coding", "ai-agents", "human-in-the-loop"}:
        errors.append("package.json: keywords must carry at least one current positioning term")
    publish_config = package.get("publishConfig", {})
    if publish_config.get("registry") != "https://registry.npmjs.org/":
        errors.append("package.json: publishConfig must pin the official npm registry")
    if publish_config.get("access") != "public":
        errors.append("package.json: publishConfig must keep the package public")
    prepublish = package.get("scripts", {}).get("prepublishOnly", "")
    for required in (
        "npm test",
        "npm run test:pilot",
        "npm run test:plugin",
        "npm run test:pack-firstrun",
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
    if verified_match is None:
        errors.append("docs/RELEASING.md: scoped distribution evidence state is missing")
    elif version_match is not None:
        # Compare on the numeric cores; pre-release suffixes never make a
        # verified distribution outrank the source package version.
        verified_core = re.match(r"(\d+)\.(\d+)\.(\d+)", verified_match.group(1))
        verified_parts = tuple(int(verified_core.group(i)) for i in (1, 2, 3))
        source_parts = tuple(int(version_match.group(i)) for i in (1, 2, 3))
        if verified_parts > source_parts:
            errors.append(
                "docs/RELEASING.md: verified npm distribution cannot exceed source package version"
            )
    if f"source package version `@haiyangbg/buildbeat@{version}`" not in release_guide:
        errors.append("docs/RELEASING.md: source package version evidence is stale")

    for relative in ("README.md", "README.en.md"):
        content = (ROOT / relative).read_text(encoding="utf-8")
        for command in (
            "npm view @haiyangbg/buildbeat@latest version",
            "npm install --global @haiyangbg/buildbeat@latest",
        ):
            if command not in content:
                errors.append(f"{relative}: missing evergreen npm package command {command}")
        hard_coded_command = re.search(
            r"(?:--package=|--global\s+)@haiyangbg/buildbeat@\d+\.\d+\.\d+",
            content,
        )
        if hard_coded_command is not None:
            errors.append(
                f"{relative}: hard-coded executable package command will make the immutable npm README stale: {hard_coded_command.group(0)}"
            )
    if not ((ROOT / "bin/buildbeat.js").stat().st_mode & 0o111):
        errors.append("bin/buildbeat.js: executable bit is missing")
    if not ((ROOT / ".github/scripts/publish-candidate.sh").stat().st_mode & 0o111):
        errors.append(".github/scripts/publish-candidate.sh: executable bit is missing")
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
        'bin/buildbeat.js" --version',
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


def check_active_docs_currency() -> list[str]:
    """Active documents must describe the current distribution and contracts.

    Every pattern here was found in a shipped document at some point; this
    keeps them from coming back."""
    errors: list[str] = []
    compiled = [(re.compile(pattern), meaning) for pattern, meaning in STALE_ACTIVE_CLAIMS]
    for relative in ACTIVE_DOCS:
        path = ROOT / relative
        if not path.exists():
            errors.append(f"{relative}: active document listed in ACTIVE_DOCS is missing")
            continue
        text = path.read_text(encoding="utf-8")
        for pattern, meaning in compiled:
            match = pattern.search(text)
            if match is not None:
                line = text.count("\n", 0, match.start()) + 1
                errors.append(f"{relative}:{line}: stale claim ({meaning}): {match.group(0)}")

    # The Skill's frontmatter description is what a session sees when it
    # decides whether to load the skill; long descriptions get truncated.
    skill_lines = (ROOT / "SKILL.md").read_text(encoding="utf-8").splitlines()
    for line in skill_lines[1:10]:
        if line.startswith("description:"):
            length = len(line[len("description:"):].strip())
            if length > 1024:
                errors.append(f"SKILL.md: frontmatter description is {length} characters; keep it under 1024")
            if "`buildbeat`" not in line:
                errors.append("SKILL.md: frontmatter description must name the `buildbeat` runtime")
            break
    else:
        errors.append("SKILL.md: frontmatter description not found in the first lines")

    # Worker envelope: the documented finding shape must be the parsed one.
    contract = (ROOT / "docs/v2/guide/05-worker-contract.md").read_text(encoding="utf-8")
    for fragment in ('"severity": "P1", "summary"', "`P0` / `P1` 阻断", "`invalid-output`"):
        if fragment not in contract:
            errors.append(f"docs/v2/guide/05-worker-contract.md: missing parser-aligned contract fragment {fragment}")

    # Every documented install line in active docs must use the stable channel.
    for relative in ACTIVE_DOCS:
        text = (ROOT / relative).read_text(encoding="utf-8")
        for match in re.finditer(r"npm (?:i|install)(?: -g| --global)? @haiyangbg/buildbeat@([A-Za-z0-9.\-]+)", text):
            if match.group(1) != "latest":
                line = text.count("\n", 0, match.start()) + 1
                errors.append(f"{relative}:{line}: install line must use @latest: {match.group(0)}")
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
    errors.extend(check_publish_workflow())
    errors.extend(check_workflow_action_pins())
    errors.extend(check_repository_governance())
    errors.extend(check_active_docs_currency())

    if errors:
        print("Documentation checks failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"Documentation checks passed: {len(paths)} Markdown files, "
        "relative links, bilingual README shape, frontmatter, critical and removed files, plugin boundary, package metadata, publish workflow, repository governance, and active-document currency."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
