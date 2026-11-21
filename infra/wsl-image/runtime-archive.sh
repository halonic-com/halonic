#!/usr/bin/env bash
# Packs the runtime Studio installs in Halonic's WSL distro (HAL-14644): the
# Linux agent host executable, which carries Node, the engine and srt, as
# bin/halonic-agent-host in the archive the runtime updater takes
# (files/halonic-runtime install). Build only: nothing is published.
# Usage: runtime-archive.sh <halonic-agent-host> <version> <out-dir>
# Writes <out-dir>/halonic-runtime.tar.gz and <out-dir>/halonic-runtime.json
# ({"version","sha256","size"}), which Studio pins: it checks the SHA-256 on
# Windows before it sends the archive, and the updater checks it again.
# The same executable and version give the same bytes: fixed order, times,
# owners and modes, and gzip without a name or time.
set -euo pipefail
fail() { echo "runtime-archive: $*" >&2; exit 1; }
[ $# -eq 3 ] || fail "usage: runtime-archive.sh <halonic-agent-host> <version> <out-dir>"
exe="$1" version="$2" out="$3"
[ -f "$exe" ] && [ ! -L "$exe" ] || fail "not a file: $exe"
# The updater's rule for a version (valid_version in files/halonic-runtime).
case "$version" in
  "" | current | previous | .* | *[!0-9A-Za-z.+_-]*) fail "not a version: $version" ;;
esac
[ "${#version}" -le 64 ] || fail "the version is longer than 64 characters"

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
install -d -m 0755 "$stage/bin"
install -m 0755 "$exe" "$stage/bin/halonic-agent-host"
mkdir -p "$out"
archive="$out/halonic-runtime.tar.gz"
tar --create --format=gnu --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner \
  --mode=go-w,ug-s -C "$stage" bin | gzip -n -9 > "$archive"
sha256="$(sha256sum "$archive" | cut -d' ' -f1)"
size="$(stat -c %s "$archive")"
printf '{"version":"%s","sha256":"%s","size":%s}\n' "$version" "$sha256" "$size" > "$out/halonic-runtime.json"
echo "packed $version ($size bytes, sha256 $sha256)"
