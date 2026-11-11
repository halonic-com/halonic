#!/usr/bin/env bash
# Checks a built image: the config files, the packages, the empty runtime
# slot, and that the tools start. Usage: check.sh <halonic-wsl.tar.gz>
# Needs root for the chroot run.
set -euo pipefail
img="${1:?usage: check.sh <halonic-wsl.tar.gz>}"
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }

tar -xzf "$img" -C "$root" --numeric-owner

conf="$root/etc/wsl.conf"
for want in "[interop]" "enabled=false" "appendWindowsPath=false" "[automount]" "default=halonic" "systemd=false"; do
  grep -qxF "$want" "$conf" || fail "wsl.conf lacks '$want'"
done
# interop and automount must both be off, and systemd too
[ "$(grep -c '^enabled=false$' "$conf")" -eq 2 ] || fail "interop and automount must both be disabled"

[ -d "$root/opt/halonic" ] || fail "/opt/halonic is missing"
[ -f "$root/usr/share/doc/halonic-image/NOTICE" ] || fail "licence notice is missing"
[ -f "$root/usr/share/doc/halonic-image/SNAPSHOT.txt" ] || fail "source pointer is missing"
grep -q '^halonic:' "$root/etc/passwd" || fail "user halonic is missing"
grep -q '^root:[!*]' "$root/etc/shadow" || fail "root password is not locked"
[ -e "$root/usr/share/doc/bubblewrap/copyright" ] || fail "no copyright file for bubblewrap"

for pkg in bubblewrap socat ripgrep git ca-certificates; do
  grep -q "^$pkg	" "$root/usr/share/doc/halonic-image/packages.txt" || fail "package $pkg missing"
done
# Nothing we don't want: no init system, no editors, no Windows interop helpers.
for bad in systemd nano vim curl wget sudo; do
  if grep -q "^$bad	" "$root/usr/share/doc/halonic-image/packages.txt"; then fail "unexpected package $bad"; fi
done

chroot "$root" bwrap --version
chroot "$root" socat -V | head -2
chroot "$root" rg --version | head -1
chroot "$root" git --version
chroot "$root" su halonic -s /bin/sh -c 'id -un' | grep -qx halonic || fail "cannot run as halonic"
echo "OK: image checks passed"
