#!/usr/bin/env bash
set -euo pipefail

package_name="${BUILDBEAT_PACKAGE_NAME:-@haiyangbg/buildbeat}"
official_registry="https://registry.npmjs.org/"
package_version="${BUILDBEAT_PACKAGE_VERSION:-${SOLOBATON_PACKAGE_VERSION:-}}"
candidate_integrity="${BUILDBEAT_CANDIDATE_INTEGRITY:-${SOLOBATON_CANDIDATE_INTEGRITY:-}}"
candidate_tarball="${BUILDBEAT_CANDIDATE_TARBALL:-${SOLOBATON_CANDIDATE_TARBALL:-}}"
reconcile_attempts="${BUILDBEAT_RECONCILE_ATTEMPTS:-${SOLOBATON_RECONCILE_ATTEMPTS:-12}}"
reconcile_delay_seconds="${BUILDBEAT_RECONCILE_DELAY_SECONDS:-${SOLOBATON_RECONCILE_DELAY_SECONDS:-5}}"

if [[ "${NPM_CONFIG_REGISTRY:-}" != "$official_registry" ]]; then
  echo "NPM_CONFIG_REGISTRY must be pinned to $official_registry" >&2
  exit 2
fi
if [[ "$package_name" != "@haiyangbg/buildbeat" ]]; then
  echo "BUILDBEAT_PACKAGE_NAME must be @haiyangbg/buildbeat." >&2
  exit 2
fi
if [[ ! "$package_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "BUILDBEAT_PACKAGE_VERSION must use MAJOR.MINOR.PATCH." >&2
  exit 2
fi
if [[ ! "$candidate_integrity" =~ ^sha512-[A-Za-z0-9+/]+={0,2}$ ]]; then
  echo "BUILDBEAT_CANDIDATE_INTEGRITY must be a sha512 integrity value." >&2
  exit 2
fi
if [[ ! -f "$candidate_tarball" ]]; then
  echo "BUILDBEAT_CANDIDATE_TARBALL must name the packed candidate file." >&2
  exit 2
fi
if [[ ! "$reconcile_attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo "BUILDBEAT_RECONCILE_ATTEMPTS must be a positive integer." >&2
  exit 2
fi
if [[ ! "$reconcile_delay_seconds" =~ ^[0-9]+$ ]]; then
  echo "BUILDBEAT_RECONCILE_DELAY_SECONDS must be a non-negative integer." >&2
  exit 2
fi

registry_integrity() {
  npm view "$package_name@$package_version" dist.integrity \
    --registry="$official_registry" 2>/dev/null || true
}

existing_integrity="$(registry_integrity)"
if [[ -n "$existing_integrity" ]]; then
  if [[ "$existing_integrity" == "$candidate_integrity" ]]; then
    printf 'Registry already contains the exact candidate %s@%s; continuing verification.\n' \
      "$package_name" "$package_version"
    exit 0
  fi
  echo "$package_name@$package_version already exists with different integrity." >&2
  exit 1
fi

publish_status=0
npm publish "$candidate_tarball" --access public --registry="$official_registry" || publish_status=$?
if ((publish_status == 0)); then
  exit 0
fi

for ((attempt = 1; attempt <= reconcile_attempts; attempt += 1)); do
  existing_integrity="$(registry_integrity)"
  if [[ "$existing_integrity" == "$candidate_integrity" ]]; then
    printf 'Publish response failed, but registry reconciliation proved the exact candidate on attempt %s.\n' \
      "$attempt"
    exit 0
  fi
  if [[ -n "$existing_integrity" ]]; then
    echo "$package_name@$package_version appeared with different integrity." >&2
    exit 1
  fi
  if ((attempt < reconcile_attempts)); then
    sleep "$reconcile_delay_seconds"
  fi
done

echo "Publish failed and the exact candidate could not be reconciled from the registry." >&2
exit "$publish_status"
