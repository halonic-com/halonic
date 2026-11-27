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
# Root's alone: the updater replaces itself there (HAL-15161).
install -d -o root -g root -m 0755 "$root/usr/local/sbin"
install -o root -g root -m 0755 "$here/files/halonic-runtime" "$root/usr/local/sbin/halonic-runtime"
install -d -m 0755 "$root/usr/share/doc/halonic-image"
install -m 0644 "$here/files/NOTICE" "$root/usr/share/doc/halonic-image/NOTICE"
printf "suite=%s\nsnapshot=%s\n" "$suite" "$snap" > "$root/usr/share/doc/halonic-image/SNAPSHOT.txt"
# The image's version (HAL-15161): `halonic-runtime status` reports it.
image="$(cat "$here/image-version")"
case "$image" in ''|*[!0-9]*) echo "customize: image-version isn't a whole number" >&2; exit 1 ;; esac
printf "%s\n" "$image" > "$root/usr/share/doc/halonic-image/IMAGE"
chroot "$root" dpkg-query -W -f="\${Package}\t\${Version}\t\${Source}\n" \
  > "$root/usr/share/doc/halonic-image/packages.txt"
# A normal user, no password, no sudo: the updater uses wsl.exe -u root.
chroot "$root" useradd --create-home --shell /bin/bash --user-group halonic
chroot "$root" passwd --lock root >/dev/null
# No setuid or setgid programs (HAL-5845): root here can mount the Windows
# drive, so no su, mount, chsh and the like for halonic to climb with. Root
# runs them without the bit. dpkg-statoverride keeps the bit off after an upgrade.
find "$root" -xdev -type f -perm /6000 | while read -r f; do
  path="${f#"$root"}"
  # Names from the image's own passwd and group, not the build host's.
  owner="$(chroot "$root" stat -c %U "$path")"
  group="$(chroot "$root" stat -c %G "$path")"
  old="$(chroot "$root" stat -c %a "$path")"
  mode="$(printf '%o' $(( 0$old & 0777 )))"
  echo "customize: drop setuid/setgid from $path ($old -> $mode)"
  chroot "$root" dpkg-statoverride --update --add "$owner" "$group" "$mode" "$path"
done
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
# No translations, man pages or docs (HAL-20583): only the copyright files,
# the doc folders that are links (to another package's folder with its
# copyright) and halonic-image/ stay. The dpkg file keeps it that way through
# security updates.
doc="$root/usr/share/doc"
install -m 0644 "$here/files/dpkg-nodoc" "$root/etc/dpkg/dpkg.cfg.d/halonic-nodoc"
find "$root/usr/share/locale" "$root/usr/share/man" -mindepth 1 -delete
find "$doc" -mindepth 2 ! -type d ! -name copyright ! -path "$doc/halonic-image/*" -delete
find "$doc" -mindepth 1 -type d -empty -delete
# Keep the image small and the build repeatable.
rm -rf "$root"/var/lib/apt/lists/* "$root"/var/cache/apt/* \
       "$root"/var/log/* "$root"/etc/machine-id "$root"/var/lib/dbus/machine-id
: > "$root/etc/machine-id"
