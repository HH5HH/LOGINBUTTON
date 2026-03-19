#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_path="${1:-$repo_root/loginbutton_distro.zip}"
archive_root_name="loginbutton_distro"
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/loginbutton-distro.XXXXXX")"

cleanup() {
  rm -rf "$staging_dir"
}

trap cleanup EXIT

if [[ "$output_path" != /* ]]; then
  output_path="$repo_root/$output_path"
fi

output_name="$(basename "$output_path")"

cd "$repo_root"

while IFS= read -r -d '' existing_zip; do
  [[ "$(basename "$existing_zip")" == "$output_name" ]] && continue
  rm -f "$existing_zip"
done < <(find "$repo_root" -maxdepth 1 -type f \( -name '*.zip' -o -name '*.ZIP' \) -print0)

rm -f "$output_path"

mkdir -p "$staging_dir/$archive_root_name"
git checkout-index --all --force --prefix="$staging_dir/$archive_root_name/"

if [[ ! -d "$staging_dir/$archive_root_name" ]]; then
  echo "No extension files available to package." >&2
  exit 1
fi

rm -rf \
  "$staging_dir/$archive_root_name/.githooks" \
  "$staging_dir/$archive_root_name/node_modules" \
  "$staging_dir/$archive_root_name/scripts" \
  "$staging_dir/$archive_root_name/skills" \
  "$staging_dir/$archive_root_name/tests"

rm -f \
  "$staging_dir/$archive_root_name/.gitignore" \
  "$staging_dir/$archive_root_name/AGENTS.md" \
  "$staging_dir/$archive_root_name/README.md" \
  "$staging_dir/$archive_root_name/ZIP.KEY.template" \
  "$staging_dir/$archive_root_name/package-lock.json" \
  "$staging_dir/$archive_root_name/package.json"

find "$staging_dir/$archive_root_name" \( -name '*.zip' -o -name '*.ZIP' -o -name '.DS_Store' \) -delete

if [[ -z "$(find "$staging_dir/$archive_root_name" -mindepth 1 -print -quit)" ]]; then
  echo "No extension files available to package." >&2
  exit 1
fi

(
  cd "$staging_dir"
  zip -q -r -9 "$output_path" "$archive_root_name"
)

printf '%s\n' "$output_path"
