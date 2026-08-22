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
INTERNAL_CITATION = re.compile(r"(?:filecite|cite)")
EXPECTED_H2_COUNTS = {
    "README.md": 11,
    "README.en.md": 11,
}
CRITICAL_TEMPLATE_FILES = (
    "templates/AGENTS.md",
    "templates/CLAUDE.md",
    "templates/ARCHITECTURE.md",
    "templates/SOLOBATON.md",
    "templates/contracts/PROTOCOL.md",
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
    "bin/solobaton.js",
    "docs/CLI.md",
    "docs/RELEASING.md",
    "package-lock.json",
    "package.json",
    "src/cli.js",
    "src/constants.js",
    "src/doctor.js",
    "src/planner.js",
    "src/project.js",
    "tests/cli.test.js",
    "tests/publish-workflow.test.js",
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
    return sorted(ROOT / relative for relative in result.stdout.splitlines())


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
        f"missing critical scaffold file: {relative}"
        for relative in (*CRITICAL_TEMPLATE_FILES, *CRITICAL_CLI_FILES)
        if not (ROOT / relative).is_file()
    ]


def check_cli_package() -> list[str]:
    errors: list[str] = []
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")

    version = package.get("version", "")
    version_match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", version)
    latest_match = re.search(
        r"^## v(\d+)\.(\d+)(?:\.(\d+))?", changelog, re.MULTILINE
    )
    if version_match is None:
        errors.append("package.json: version must use three-part SemVer")
    elif latest_match is None:
        errors.append("CHANGELOG.md: latest release heading is missing")
    else:
        latest_version = ".".join(
            (latest_match.group(1), latest_match.group(2), latest_match.group(3) or "0")
        )
        if version != latest_version:
            errors.append(
                "package.json: version does not match the latest changelog release"
            )

    if lock.get("version") != version:
        errors.append("package-lock.json: root version does not match package.json")
    if package.get("bin", {}).get("solobaton") != "bin/solobaton.js":
        errors.append("package.json: solobaton bin entry must point to bin/solobaton.js")
    package_files = package.get("files", [])
    for required in ("docs/", "example/", "templates/", "lessons.md"):
        if required not in package_files:
            errors.append(f"package.json: published files must include {required}")
    if package.get("engines", {}).get("node") != ">=20":
        errors.append("package.json: supported Node floor must stay explicit at >=20")
    publish_config = package.get("publishConfig", {})
    if publish_config.get("registry") != "https://registry.npmjs.org/":
        errors.append("package.json: publishConfig must pin the official npm registry")
    if publish_config.get("access") != "public":
        errors.append("package.json: publishConfig must keep the package public")
    prepublish = package.get("scripts", {}).get("prepublishOnly", "")
    for required in ("npm test", "npm run check:docs", "npm run pack:check"):
        if required not in prepublish:
            errors.append(f"package.json: prepublishOnly must include {required}")

    release_guide = (ROOT / "docs/RELEASING.md").read_text(encoding="utf-8")
    verified_match = re.search(
        r"latest independently verified npm distribution `solobaton@(\d+\.\d+\.\d+)`",
        release_guide,
    )
    verified_version = verified_match.group(1) if verified_match else ""
    if verified_match is None:
        errors.append(
            "docs/RELEASING.md: latest independently verified npm distribution is missing"
        )
    elif version_match is not None:
        verified_parts = tuple(int(part) for part in verified_version.split("."))
        candidate_parts = tuple(int(part) for part in version.split("."))
        if verified_parts > candidate_parts:
            errors.append(
                "docs/RELEASING.md: verified npm distribution cannot exceed package candidate"
            )
    if f"package candidate `solobaton@{version}`" not in release_guide:
        errors.append("docs/RELEASING.md: package candidate evidence is stale")

    verified_spec = f"solobaton@{verified_version}"
    distribution_docs = ("README.md", "README.en.md", "docs/CLI.md")
    for relative in distribution_docs:
        content = (ROOT / relative).read_text(encoding="utf-8")
        if verified_version:
            required_commands = (
                f"npx --yes {verified_spec}",
                f"npm install --global {verified_spec}",
            )
            for command in required_commands:
                if command not in content:
                    errors.append(
                        f"{relative}: missing independently verified package command {command}"
                    )
        if verified_version != version:
            candidate_commands = (
                f"npx --yes solobaton@{version}",
                f"npm install --global solobaton@{version}",
            )
            for command in candidate_commands:
                if command in content:
                    errors.append(
                        f"{relative}: executable command claims unverified candidate {command}"
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
    if not ((ROOT / "bin/solobaton.js").stat().st_mode & 0o111):
        errors.append("bin/solobaton.js: executable bit is missing")
    if not ((ROOT / ".github/scripts/publish-candidate.sh").stat().st_mode & 0o111):
        errors.append(".github/scripts/publish-candidate.sh: executable bit is missing")
    return errors


def check_example_version() -> list[str]:
    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    example = (ROOT / "example/SOLOBATON.md").read_text(encoding="utf-8")
    latest_match = re.search(r"^## (v\d+\.\d+)", changelog, re.MULTILINE)
    example_match = re.search(r"本项目使用 Solobaton `(v\d+\.\d+)`", example)
    if latest_match is None:
        return ["CHANGELOG.md: no release heading found"]
    if example_match is None:
        return ["example/SOLOBATON.md: no installed version found"]
    if latest_match.group(1) != example_match.group(1):
        return [
            "example/SOLOBATON.md: installed version "
            f"{example_match.group(1)} does not match latest changelog {latest_match.group(1)}"
        ]
    return []


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
        'test "$GITHUB_REF" = "refs/heads/main"',
        'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',
        'test "$(git rev-parse HEAD)" = "$(git rev-parse refs/remotes/origin/main)"',
        "bash .github/scripts/publish-candidate.sh",
        "needs: publish",
        "dist.attestations.url",
        "https://slsa.dev/provenance/v1",
        "npm audit signatures",
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
    errors.extend(check_cli_package())
    errors.extend(check_example_version())
    errors.extend(check_publish_workflow())

    if errors:
        print("Documentation checks failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"Documentation checks passed: {len(paths)} Markdown files, "
        "relative links, bilingual README shape, frontmatter, critical files, and CLI package metadata."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
