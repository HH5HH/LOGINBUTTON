#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_path="${1:-$repo_root/loginbutton_distro.zip}"
metadata_path="$repo_root/loginbutton_distro.version.json"
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
  existing_name="$(basename "$existing_zip")"
  [[ "$existing_name" == "$output_name" ]] && continue

  case "$existing_name" in
    loginbutton*.zip|loginbutton*.ZIP|*distro*.zip|*distro*.ZIP)
      rm -f "$existing_zip"
      ;;
  esac
done < <(find "$repo_root" -maxdepth 1 -type f \( -name '*.zip' -o -name '*.ZIP' \) -print0)

rm -f "$output_path"

node - "$repo_root/manifest.json" "$metadata_path" <<'NODE'
const fs = require("node:fs");

const [manifestPath, metadataPath] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const version = String(manifest?.version || "").trim();
const versionName = String(manifest?.version_name || version).trim() || version;

if (!version) {
  throw new Error("manifest.json is missing version");
}

const metadata = {
  version,
  version_name: versionName,
  package_path: "loginbutton_distro.zip",
  archive_root: "loginbutton_distro",
  archive_manifest_path: "loginbutton_distro/manifest.json"
};

fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
NODE

mkdir -p "$staging_dir/$archive_root_name"
node "$repo_root/scripts/build_loginbutton_distro.js" "$repo_root" "$staging_dir/$archive_root_name"

if [[ -z "$(find "$staging_dir/$archive_root_name" -mindepth 1 -print -quit)" ]]; then
  echo "No extension files available to package." >&2
  exit 1
fi

(
  cd "$staging_dir"
  zip -q -r -9 "$output_path" "$archive_root_name"
)

printf '%s\n' "$output_path"
