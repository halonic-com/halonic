#!/usr/bin/env bash
# Builds Halonic's WSL image: Debian stable minbase from a pinned snapshot.
# Needs root (or fakechroot-style rights) and mmdebstrap, tar, gzip.
# Usage: build.sh <output-dir>
# Writes <output-dir>/halonic-wsl.tar.gz, packages.txt and sizes.json.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="${1:?usage: build.sh <output-dir>}"
# shellcheck source=snapshot.conf
. "$here/snapshot.conf"

mkdir -p "$out"
out="$(cd "$out" && pwd)"
tarball="$out/halonic-wsl.tar"
# Same input, same bytes: file times come from the snapshot date.
SOURCE_DATE_EPOCH="$(date -u -d "${DEBIAN_SNAPSHOT:0:8}" +%s)"
export SOURCE_DATE_EPOCH

packages=(bubblewrap socat ripgrep git ca-certificates passwd)

mmdebstrap \
  --variant=minbase \
  --format=tar \
  --include="$(IFS=,; echo "${packages[*]}")" \
  --customize-hook='
    set -eu
    root="$1"
    here="'"$here"'"
    snap="'"$DEBIAN_SNAPSHOT"'"
    suite="'"$DEBIAN_SUITE"'"
    install -m 0644 "$here/files/wsl.conf" "$root/etc/wsl.conf"
    install -d -m 0755 "$root/opt/halonic"
    install -m 0644 "$here/files/opt-halonic-README" "$root/opt/halonic/README"
    install -d -m 0755 "$root/usr/share/doc/halonic-image"
    install -m 0644 "$here/files/NOTICE" "$root/usr/share/doc/halonic-image/NOTICE"
    printf "suite=%s\nsnapshot=%s\n" "$suite" "$snap" > "$root/usr/share/doc/halonic-image/SNAPSHOT.txt"
    chroot "$root" dpkg-query -W -f="\${Package}\t\${Version}\t\${Source}\n" \
      > "$root/usr/share/doc/halonic-image/packages.txt"
    # A normal user, no password, no sudo: the updater uses wsl.exe -u root.
    chroot "$root" useradd --create-home --shell /bin/bash --user-group halonic
    chroot "$root" passwd --lock root >/dev/null
    # Runtime apt points at Debian itself (the pin is only for the build).
    rm -f "$root/etc/apt/sources.list"
    install -d -m 0755 "$root/etc/apt/sources.list.d"
    cat > "$root/etc/apt/sources.list.d/debian.sources" <<SRC
Types: deb deb-src
URIs: https://deb.debian.org/debian
Suites: $suite $suite-updates
Components: main
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg

Types: deb deb-src
URIs: https://security.debian.org/debian-security
Suites: $suite-security
Components: main
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg
SRC
    # Keep the image small and the build repeatable.
    rm -rf "$root"/var/lib/apt/lists/* "$root"/var/cache/apt/* \
           "$root"/var/log/* "$root"/etc/machine-id "$root"/var/lib/dbus/machine-id
    : > "$root/etc/machine-id"
  ' \
  "$DEBIAN_SUITE" "$tarball" \
  "deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/$DEBIAN_SNAPSHOT $DEBIAN_SUITE main" \
  "deb [check-valid-until=no] https://snapshot.debian.org/archive/debian-security/$DEBIAN_SNAPSHOT $DEBIAN_SUITE-security main"

gzip -9 -n -f "$tarball"

# Sizes Noah needs: what people download, and what the distro takes on disk.
tar -xzf "$tarball.gz" --one-top-level="$out/rootfs" --numeric-owner
download_bytes="$(stat -c %s "$tarball.gz")"
disk_bytes="$(du -sb "$out/rootfs" | cut -f1)"
sha256="$(sha256sum "$tarball.gz" | cut -d' ' -f1)"
tar -xzOf "$tarball.gz" ./usr/share/doc/halonic-image/packages.txt > "$out/packages.txt"
rm -rf "$out/rootfs"
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
