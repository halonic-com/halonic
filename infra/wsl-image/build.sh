#!/usr/bin/env bash
# Builds Halonic's WSL image: Debian stable minbase from a pinned snapshot.
# Needs root and mmdebstrap (a recent one: use Debian trixie or newer), tar, gzip.
# Usage: build.sh <output-dir>
# Writes <output-dir>/halonic-wsl.tar.gz, packages.txt and sizes.json.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="${1:?usage: build.sh <output-dir>}"
# shellcheck source=snapshot.conf
# shellcheck disable=SC1091
. "$here/snapshot.conf"

mkdir -p "$out"
out="$(cd "$out" && pwd)"
tarball="$out/halonic-wsl.tar"
# Same input, same bytes: file times come from the snapshot date.
SOURCE_DATE_EPOCH="$(date -u -d "${DEBIAN_SNAPSHOT:0:8}" +%s)"
export SOURCE_DATE_EPOCH
export HALONIC_SUITE="$DEBIAN_SUITE" HALONIC_SNAPSHOT="$DEBIAN_SNAPSHOT"

packages=(bubblewrap socat ripgrep git ca-certificates passwd)

mmdebstrap \
  --variant=minbase \
  --format=tar \
  --include="$(IFS=,; echo "${packages[*]}")" \
  --customize-hook="$here/customize.sh \"\$1\"" \
  "$DEBIAN_SUITE" "$tarball" \
  "deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/$DEBIAN_SNAPSHOT $DEBIAN_SUITE main" \
  "deb [check-valid-until=no] https://snapshot.debian.org/archive/debian-security/$DEBIAN_SNAPSHOT $DEBIAN_SUITE-security main"

gzip -9 -n -f "$tarball"

# Sizes Noah needs: what people download, and what the distro takes on disk.
rootfs="$(mktemp -d)"
trap 'rm -rf "$rootfs"' EXIT
tar -xzf "$tarball.gz" -C "$rootfs" --numeric-owner
download_bytes="$(stat -c %s "$tarball.gz")"
disk_bytes="$(du -sb "$rootfs" | cut -f1)"
sha256="$(sha256sum "$tarball.gz" | cut -d' ' -f1)"
tar -xzOf "$tarball.gz" ./usr/share/doc/halonic-image/packages.txt > "$out/packages.txt"
cat > "$out/sizes.json" <<JSON
{
  "suite": "$DEBIAN_SUITE",
  "snapshot": "$DEBIAN_SNAPSHOT",
  "downloadBytes": $download_bytes,
  "onDiskBytes": $disk_bytes,
  "downloadMB": $(( (download_bytes + 500000) / 1000000 )),
  "onDiskMB": $(( (disk_bytes + 500000) / 1000000 )),
  "sha256": "$sha256"
}
JSON
cat "$out/sizes.json"
