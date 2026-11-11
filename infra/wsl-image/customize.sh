#!/bin/sh
# Runs inside mmdebstrap (--customize-hook) on the new root: $1 is the root.
# Needs HALONIC_SUITE and HALONIC_SNAPSHOT in the environment (set by build.sh).
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
suite="$HALONIC_SUITE"
snap="$HALONIC_SNAPSHOT"
root="$1"
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
