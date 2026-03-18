#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${ROOT}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
cd "$ROOT"

MANIFEST="manifest.json"

usage() {
  cat <<USAGE
Usage: auto_bump_manifest_version.sh [--if-staged-loginbutton-changes]

Options:
  --if-staged-loginbutton-changes   Bump only when staged LoginButton app files are present.
  --help                            Show this help text.

Behavior:
  - Uses rollover patch bumps:
      - x.y.z -> x.y.(z+1) when z < 100
      - x.y.z -> x.(y+1).0 when z >= 100
  - Legacy overflow versions are normalized with carry:
      - 1.2.104 is treated as 1.3.4 baseline before the next bump.
  - Updates both version and version_name.
  - Prints new version to stdout only when a bump occurs.
USAGE
}

mode="always"
case "${1:-}" in
  "")
    ;;
  --if-staged-loginbutton-changes)
    mode="staged"
    ;;
  --help)
    usage
    exit 0
    ;;
  *)
    echo "error: unknown argument '$1'" >&2
    usage
    exit 1
    ;;
esac

trigger_file() {
  local path="$1"

  case "$path" in
    .git/*|.githooks/*|scripts/*|node_modules/*)
      return 1
      ;;
  esac

  case "$path" in
    manifest.json|package.json|package-lock.json|.DS_Store)
      return 1
      ;;
  esac

  case "$path" in
    docs/*|*/docs/*)
      return 1
      ;;
  esac

  case "$path" in
    *.zip|*.md|*.MD)
      return 1
      ;;
  esac

  return 0
}

if [[ "$mode" == "staged" ]]; then
  git rev-parse --show-toplevel >/dev/null 2>&1 || exit 0

  should_bump=0
  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    if trigger_file "$path"; then
      should_bump=1
      break
    fi
  done < <(git diff --cached --name-only --diff-filter=ACMR)

  [[ "$should_bump" -eq 1 ]] || exit 0
fi

if [[ ! -f "$MANIFEST" ]]; then
  echo "error: missing $MANIFEST" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required for auto version bump" >&2
  exit 1
fi

current="$(jq -r '.version // empty' "$MANIFEST")"
if [[ -z "$current" ]]; then
  echo "error: manifest version not found" >&2
  exit 1
fi

if [[ ! "$current" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "error: unsupported manifest version format '$current' (expected x.y.z)" >&2
  exit 1
fi

major="${BASH_REMATCH[1]}"
minor="${BASH_REMATCH[2]}"
patch="${BASH_REMATCH[3]}"

normalized_major="$major"
normalized_minor="$minor"
normalized_patch="$patch"

if (( normalized_patch >= 100 )); then
  overflow=$((normalized_patch - 100))
  normalized_minor=$((normalized_minor + 1 + (overflow / 101)))
  normalized_patch=$((overflow % 101))
fi

if (( normalized_patch >= 100 )); then
  new_major="$normalized_major"
  new_minor=$((normalized_minor + 1))
  new_patch=0
else
  new_major="$normalized_major"
  new_minor="$normalized_minor"
  new_patch=$((normalized_patch + 1))
fi

new_version="${new_major}.${new_minor}.${new_patch}"

tmp="$(mktemp)"
jq --arg version "$new_version" '.version = $version | .version_name = $version' "$MANIFEST" > "$tmp"
mv "$tmp" "$MANIFEST"

echo "$new_version"
