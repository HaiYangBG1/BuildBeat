#!/usr/bin/env bash
# After a stable release reaches dist-tag latest, point dist-tag next at the
# same version, with the publish job's Trusted Publishing (OIDC) identity: no
# npm login, no one-time password. `--check` only reads and reports whether
# next is where it should be. A next that holds a newer pre-release (its
# MAJOR.MINOR.PATCH is greater than this version's) is left alone.
set -euo pipefail

package_name="${BUILDBEAT_PACKAGE_NAME:-@haiyangbg/buildbeat}"
official_registry="https://registry.npmjs.org/"
package_version="${BUILDBEAT_PACKAGE_VERSION:-}"
mode="${1:-move}"

if [[ "${NPM_CONFIG_REGISTRY:-}" != "$official_registry" ]]; then
  echo "NPM_CONFIG_REGISTRY must be pinned to $official_registry" >&2
  exit 2
fi
if [[ "$package_name" != "@haiyangbg/buildbeat" ]]; then
  echo "BUILDBEAT_PACKAGE_NAME must be @haiyangbg/buildbeat." >&2
  exit 2
fi
if [[ ! "$package_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$ ]]; then
  echo "BUILDBEAT_PACKAGE_VERSION must use MAJOR.MINOR.PATCH with an optional pre-release suffix." >&2
  exit 2
fi
if [[ "$mode" != "move" && "$mode" != "--check" ]]; then
  echo "usage: follow-next.sh [--check]" >&2
  exit 2
fi

if [[ "$package_version" == *-* ]]; then
  echo "Pre-release $package_version was published on next itself; nothing to follow."
  exit 0
fi

# Numeric MAJOR.MINOR.PATCH comparison: prints 1 when $1 > $2, else 0.
core_greater() {
  local IFS=.
  local -a left right
  read -r -a left <<< "${1%%-*}"
  read -r -a right <<< "${2%%-*}"
  local i
  for i in 0 1 2; do
    if ((10#${left[$i]} > 10#${right[$i]})); then
      echo 1
      return
    fi
    if ((10#${left[$i]} < 10#${right[$i]})); then
      echo 0
      return
    fi
  done
  echo 0
}

# A failed read is not an empty tag: moving next blind could replace a newer
# pre-release. A package with no next prints nothing and exits 0.
if ! current_next="$(npm view "$package_name" dist-tags.next --registry="$official_registry")"; then
  echo "Could not read dist-tag next of $package_name; nothing was changed." >&2
  exit 1
fi

if [[ "$current_next" == "$package_version" ]]; then
  printf 'next already points at %s.\n' "$package_version"
  exit 0
fi
if [[ "$current_next" =~ ^[0-9]+\.[0-9]+\.[0-9]+-.+$ && "$(core_greater "$current_next" "$package_version")" == 1 ]]; then
  printf 'next holds the newer pre-release %s; leaving it for %s.\n' "$current_next" "$package_version"
  exit 0
fi

if [[ "$mode" == "--check" ]]; then
  printf 'next points at %s, not at the stable %s.\n' "${current_next:-nothing}" "$package_version" >&2
  exit 1
fi

if ! npm dist-tag add "$package_name@$package_version" next --registry="$official_registry"; then
  cat >&2 <<EOF
Could not point next at $package_version through Trusted Publishing.
On npmjs.com, open $package_name -> Settings -> Trusted publishing and enable
"Allow npm dist-tag" for this workflow, then re-run the failed jobs: the
publish step finds the identical package already published and goes on here.
EOF
  exit 1
fi
printf 'next now points at %s.\n' "$package_version"
