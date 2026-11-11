#!/usr/bin/env bash
# Checks a built image: the config files, the packages, the empty runtime
# slot, and that the tools start. Usage: check.sh <halonic-wsl.tar.gz>
# Needs root for the chroot run.
set -euo pipefail
img="${1:?usage: check.sh <halonic-wsl.tar.gz>}"
root="$(mktemp -d)"
canary="$(mktemp -d)"
trap 'rm -rf "$root" "$canary"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
# With extended attributes, so file capabilities (security.capability) show.
extract() { tar -xzf "$1" -C "$2" --numeric-owner --xattrs --xattrs-include='*'; }

extract "$img" "$root"

# Each setting under its own section: "[section]key=value" per line.
conf="$(awk '/^\[/ { s = $0; next } NF && !/^#/ { print s $0 }' "$root/etc/wsl.conf")"
for want in "[interop]enabled=false" "[interop]appendWindowsPath=false" \
            "[automount]enabled=false" "[automount]mountFsTab=false" \
            "[user]default=halonic" "[boot]systemd=false"; do
  grep -qxF "$want" <<<"$conf" || fail "wsl.conf lacks '$want'"
done

# No setuid or setgid programs (HAL-5845): root can mount the Windows drive.
# Add a path here only with a reason in the review.
allowed_setid=()
while IFS= read -r f; do
  path="${f#"$root"}"
  for ok in "${allowed_setid[@]}"; do [ "$path" = "$ok" ] && continue 2; done
  fail "setuid or setgid file: $path"
done < <(find "$root" -xdev -type f -perm /6000)
# The bit stays off after an apt upgrade only through dpkg-statoverride.
grep -q ' /usr/bin/su$' "$root/var/lib/dpkg/statoverride" || fail "no statoverride for /usr/bin/su"

# No file capabilities either (HAL-6181): the other way up to root. The canary
# first proves this extraction and getcap see them, so an empty list means none.
mkdir "$canary/in" "$canary/out"
touch "$canary/in/ping"
setcap cap_net_raw+ep "$canary/in/ping"
tar -czf "$canary/canary.tar.gz" -C "$canary/in" --xattrs --xattrs-include='*' .
extract "$canary/canary.tar.gz" "$canary/out"
getcap -r "$canary/out" | grep -q 'cap_net_raw' || fail "capabilities don't survive extraction, can't check them"
# Add a path here only with a reason in the review.
allowed_caps=()
while IFS= read -r line; do
  path="${line%% *}"
  path="${path#"$root"}"
  for ok in "${allowed_caps[@]}"; do [ "$path" = "$ok" ] && continue 2; done
  fail "file with capabilities: $path (${line#* })"
done < <(getcap -r "$root")

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

# The runtime updater (HAL-5396, security review W2): every runtime folder is
# root's and not writable by halonic, after an update and after a rollback.
updater=/usr/local/sbin/halonic-runtime
[ "$(stat -c '%U %a' "$root$updater")" = "root 755" ] || fail "$updater must be root's, mode 755"
runtime() { # <version>: a runtime archive owned by uid 1000, with a setuid and a group-writable file
  local dir; dir="$(mktemp -d)"
  mkdir -p "$dir/bin" "$dir/lib"
  printf '#!/bin/sh\necho %s\n' "$1" > "$dir/bin/engine"
  chmod 4775 "$dir/bin/engine"
  echo data > "$dir/lib/data"
  chmod 0666 "$dir/lib/data"
  tar -czf "$root/tmp/$1.tar.gz" -C "$dir" --owner=1000 --group=1000 .
  rm -rf "$dir"
  sha256sum "$root/tmp/$1.tar.gz" | cut -d' ' -f1
}
install_runtime() { # <version> <sha256>
  chroot "$root" "$updater" install "$1" "$2" < "$root/tmp/$1.tar.gz"
}
owned_by_root() {
  [ "$(stat -c %u "$root/opt/halonic")" -eq 0 ] || fail "/opt/halonic is not root's"
  [ -z "$(find "$root/opt/halonic" ! -user root -print -quit)" ] || fail "a runtime file is not root's"
  [ -z "$(find "$root/opt/halonic" ! -type l -perm /6022 -print -quit)" ] ||
    fail "a runtime file is writable by group or others, or setuid"
  for file in /opt/halonic/x /opt/halonic/current/bin/x; do
    if chroot "$root" su halonic -s /bin/sh -c "touch $file" 2>/dev/null; then fail "halonic can write $file"; fi
  done
}
links() { echo "$(readlink "$root/opt/halonic/current") $(readlink "$root/opt/halonic/previous" || true)"; }
first="$(runtime 1.0.0)"
second="$(runtime 1.1.0)"
third="$(runtime 1.2.0)"
install_runtime 1.0.0 "$first"
install_runtime 1.1.0 "$second"
[ "$(links)" = "1.1.0 1.0.0" ] || fail "after updates: $(links)"
[ "$(chroot "$root" /opt/halonic/current/bin/engine)" = 1.1.0 ] || fail "current runtime doesn't start"
owned_by_root
chroot "$root" "$updater" rollback
[ "$(links)" = "1.0.0 1.1.0" ] || fail "after rollback: $(links)"
owned_by_root
code=0; install_runtime 1.2.0 "$first" 2>/dev/null || code=$?
[ "$code" -eq 4 ] || fail "a wrong SHA-256 gave exit $code, not 4"
[ ! -e "$root/opt/halonic/1.2.0" ] || fail "a refused archive left files"
install_runtime 1.2.0 "$third"
[ "$(links)" = "1.2.0 1.0.0" ] || fail "after the next update: $(links)"
[ ! -e "$root/opt/halonic/1.1.0" ] || fail "older runtimes are not removed"
owned_by_root
[ "$(chroot "$root" su halonic -s /bin/sh -c "$updater status")" = '{"current":"1.2.0","previous":"1.0.0"}' ] ||
  fail "status is wrong"
code=0; chroot "$root" su halonic -s /bin/sh -c "$updater rollback" 2>/dev/null || code=$?
[ "$code" -eq 2 ] || fail "halonic could roll back (exit $code)"
touch "$root/var/lib/halonic/security-update.stamp"
chroot "$root" "$updater" security-update | grep -q '^skipped' || fail "security updates ran twice in a day"
echo "OK: image checks passed"
