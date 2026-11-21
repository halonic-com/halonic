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
            "[user]default=halonic" "[boot]systemd=false" \
            '[boot]command="install -d -m 0755 -o root -g root /mnt/halonic"'; do
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

# The NOTICE offers the source through apt-get source, so every apt source
# must carry deb-src.
sources="$root/etc/apt/sources.list.d/debian.sources"
[ "$(grep -c '^Types:' "$sources")" -gt 0 ] || fail "no apt sources"
[ "$(grep '^Types:' "$sources" | grep -vc 'deb-src')" -eq 0 ] || fail "an apt source lacks deb-src"
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
runtime() { # <version> [<link target>]: a runtime archive owned by uid 1000, with a setuid
  # and a group-writable file, and lib/link pointing at <link target> (lib/data's name by default)
  local dir; dir="$(mktemp -d)"
  mkdir -p "$dir/bin" "$dir/lib"
  printf '#!/bin/sh\necho %s\n' "$1" > "$dir/bin/engine"
  chmod 4775 "$dir/bin/engine"
  echo data > "$dir/lib/data"
  chmod 0666 "$dir/lib/data"
  ln -s "${2:-data}" "$dir/lib/link"
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
[ "$(cat "$root/opt/halonic/current/lib/link")" = data ] || fail "a link inside the runtime is not kept"
owned_by_root
# A link that leaves the version folder could reach a file halonic can write.
for outside in /srv/x ../../x ../bin/../../x; do
  sum="$(runtime 1.3.0 "$outside")"
  code=0; install_runtime 1.3.0 "$sum" 2>/dev/null || code=$?
  [ "$code" -eq 5 ] || fail "a link to $outside gave exit $code, not 5"
  [ -z "$(find "$root/opt/halonic" -maxdepth 1 -name '*1.3.0')" ] || fail "a refused archive left files"
done
[ "$(chroot "$root" su halonic -s /bin/sh -c "$updater status")" = \
  '{"current":"1.2.0","previous":"1.0.0","securityUpdated":""}' ] || fail "status is wrong"
code=0; chroot "$root" su halonic -s /bin/sh -c "$updater rollback" 2>/dev/null || code=$?
[ "$code" -eq 2 ] || fail "halonic could roll back (exit $code)"
# The archive runtime-archive.sh packs (HAL-14644): the same bytes from the same
# input, root's files only, and the updater installs it and it starts.
packed="$(mktemp -d)"
printf '#!/bin/sh\necho packed\n' > "$packed/host"
"$(dirname "$0")/runtime-archive.sh" "$packed/host" 1.4.0+0123abcd "$packed/a" >/dev/null
"$(dirname "$0")/runtime-archive.sh" "$packed/host" 1.4.0+0123abcd "$packed/b" >/dev/null
cmp -s "$packed/a/halonic-runtime.tar.gz" "$packed/b/halonic-runtime.tar.gz" || fail "the runtime archive is not reproducible"
[ "$(tar -tvzf "$packed/a/halonic-runtime.tar.gz" --numeric-owner | awk '{ print $1, $2, $6 }')" = \
  "$(printf '%s\n' 'drwxr-xr-x 0/0 bin/' '-rwxr-xr-x 0/0 bin/halonic-agent-host')" ] ||
  fail "the runtime archive holds other files, owners or modes"
code=0; "$(dirname "$0")/runtime-archive.sh" "$packed/host" ../x "$packed/c" 2>/dev/null || code=$?
[ "$code" -eq 1 ] && [ ! -e "$packed/c" ] || fail "runtime-archive.sh took a version the updater refuses"
sum="$(sed -n 's/.*"sha256":"\([0-9a-f]*\)".*/\1/p' "$packed/a/halonic-runtime.json")"
[ "$sum" = "$(sha256sum "$packed/a/halonic-runtime.tar.gz" | cut -d' ' -f1)" ] || fail "halonic-runtime.json has the wrong SHA-256"
chroot "$root" "$updater" install 1.4.0+0123abcd "$sum" < "$packed/a/halonic-runtime.tar.gz" >/dev/null
[ "$(chroot "$root" /opt/halonic/current/bin/halonic-agent-host)" = packed ] || fail "the packed runtime doesn't start"
owned_by_root
rm -rf "$packed"
# An update Studio's time limit cut off inside dpkg (HAL-12672): socat is left
# half-configured, and its package script sets a file capability. Offline, so
# a stand-in apt-get fails on update: the next security-update still finishes
# socat and drops the capability, and doesn't say updates ran.
socat_status() { chroot "$root" dpkg-query -W -f "\${Status}" socat; }
cut_off_socat() {
  sed -i '/^Package: socat$/,/^$/ s/^Status: install ok installed$/Status: install ok half-configured/' \
    "$root/var/lib/dpkg/status"
  [ "$(socat_status)" = "install ok half-configured" ] || fail "couldn't cut off socat"
}
cut_off_socat
postinst="$root/var/lib/dpkg/info/socat.postinst"
[ ! -e "$postinst" ] || mv "$postinst" "$postinst.orig"
printf '#!/bin/sh\nprintf "#!/bin/sh\\n" > /usr/bin/cut-off-cap\nsetcap cap_net_raw+ep /usr/bin/cut-off-cap\n' > "$postinst"
chmod 0755 "$postinst"
printf '#!/bin/sh\necho offline >&2\nexit 100\n' > "$root/usr/sbin/apt-get"
chmod 0755 "$root/usr/sbin/apt-get"
code=0; chroot "$root" "$updater" security-update >/dev/null 2>&1 || code=$?
[ "$code" -ne 0 ] || fail "security updates succeeded offline"
[ "$(socat_status)" = "install ok installed" ] || fail "a cut-off update wasn't finished: $(socat_status)"
[ -z "$(getcap -r "$root/usr")" ] || fail "finishing a cut-off update left a file capability: $(getcap -r "$root/usr")"
chroot "$root" "$updater" status | grep -q '"securityUpdated":""' || fail "a failed update says updates ran"
# A package script that sets a capability and then fails (HAL-12766): first
# while finishing socat, then in the upgrade. Each run fails, and still drops
# the setuid bit and the capability before it stops.
printf '#!/bin/sh\nsetcap cap_net_raw+ep /usr/bin/cut-off-cap\nexit 1\n' > "$postinst"
cut_off_socat
code=0; chroot "$root" "$updater" security-update >/dev/null 2>&1 || code=$?
[ "$code" -ne 0 ] || fail "a failing package script didn't fail the update"
[ "$(socat_status)" = "install ok half-configured" ] || fail "socat's failing script didn't run: $(socat_status)"
[ -z "$(getcap -r "$root/usr")" ] || fail "a failing package script left a file capability: $(getcap -r "$root/usr")"
sed -i '/^Package: socat$/,/^$/ s/^Status: install ok half-configured$/Status: install ok installed/' \
  "$root/var/lib/dpkg/status"
cat > "$root/usr/sbin/apt-get" <<'APT'
#!/bin/sh
case " $* " in *" upgrade "*)
  printf '#!/bin/sh\n' > /usr/bin/failed-suid
  chmod 4755 /usr/bin/failed-suid
  setcap cap_net_raw+ep /usr/bin/cut-off-cap
  exit 1 ;;
esac
APT
code=0; chroot "$root" "$updater" security-update >/dev/null 2>&1 || code=$?
[ "$code" -ne 0 ] || fail "a failing upgrade succeeded"
[ "$(stat -c %a "$root/usr/bin/failed-suid")" = 755 ] || fail "a failing upgrade left a setuid program"
[ -z "$(getcap -r "$root/usr")" ] || fail "a failing upgrade left a file capability: $(getcap -r "$root/usr")"
chroot "$root" "$updater" status | grep -q '"securityUpdated":""' || fail "a failed upgrade says updates ran"
rm -f "$postinst" "$root/usr/bin/cut-off-cap" "$root/usr/bin/failed-suid"
chroot "$root" dpkg-statoverride --remove /usr/bin/failed-suid
[ ! -e "$postinst.orig" ] || mv "$postinst.orig" "$postinst"
# Security updates, with a stand-in apt-get (first on the updater's PATH) whose
# upgrade brings a new setuid program, a setgid program of another system user
# and a program with a file capability: the bits and the capability must go,
# and the bits stay gone.
cat > "$root/usr/sbin/apt-get" <<'APT'
#!/bin/sh
# Like the real apt-get, it refuses while dpkg has unfinished work.
[ -z "$(dpkg --audit)" ] || { echo "E: dpkg was interrupted" >&2; exit 100; }
case " $* " in *" upgrade "*)
  for f in new-suid new-sgid new-cap; do printf '#!/bin/sh\n' > "/usr/bin/$f"; chmod 0755 "/usr/bin/$f"; done
  chmod 4755 /usr/bin/new-suid
  chown daemon:daemon /usr/bin/new-sgid
  chmod 2755 /usr/bin/new-sgid
  setcap cap_net_raw+ep /usr/bin/new-cap ;;
esac
APT
chmod 0755 "$root/usr/sbin/apt-get"
# halonic's own setuid file is outside /usr: the updater must not touch it, or
# halonic could swap it for a link and have root chown its target.
chroot "$root" su halonic -s /bin/sh -c 'touch ~/own-suid && chmod 4755 ~/own-suid'
own="$(chroot "$root" su halonic -s /bin/sh -c 'echo ~/own-suid')"
chroot "$root" "$updater" security-update | grep -q '^security updates installed' || fail "security updates didn't run"
rm "$root/usr/sbin/apt-get"
[ "$(stat -c %a "$root/usr/bin/new-suid")" = 755 ] || fail "an upgrade left a setuid program"
chroot "$root" dpkg-statoverride --list /usr/bin/new-suid | grep -q ' 755 ' || fail "no statoverride keeps it off"
[ "$(stat -c '%U %a' "$root/usr/bin/new-sgid")" = "daemon 755" ] || fail "an upgrade left another user's setgid program"
chroot "$root" dpkg-statoverride --list /usr/bin/new-sgid | grep -q '^daemon daemon 755 ' ||
  fail "no statoverride keeps another user's setgid bit off"
[ -z "$(getcap -r "$root/usr")" ] || fail "an upgrade left a file capability: $(getcap -r "$root/usr")"
[ "$(stat -c %a "$root$own")" = 4755 ] || fail "the updater changed a file in halonic's home folder"
if chroot "$root" dpkg-statoverride --list "$own" >/dev/null; then
  fail "the updater added a statoverride for a file in halonic's home folder"
fi
chroot "$root" "$updater" status | grep -q '"securityUpdated":"[0-9]\{4\}-' || fail "status doesn't say when updates ran"
chroot "$root" "$updater" security-update | grep -q '^skipped' || fail "security updates ran twice in a day"
# Import mounts (HAL-5402, HAL-12443), with a stand-in mount (first on the
# updater's PATH) that writes down its arguments: the chroot has no drvfs.
# import-mount takes the folder on standard input only, refuses one that isn't
# an absolute drive folder, mounts it read-only for halonic at a fresh name
# under /mnt/halonic and removes the mount point when the mount fails; it
# refuses a missing /mnt/halonic, a link there or one halonic could write.
imports="$root/mnt/halonic"
cat > "$root/usr/sbin/mount" <<'MOUNT'
#!/bin/sh
[ ! -e /tmp/mount-fails ] || exit 32 # leak-guard: allow absolute-path the chroot's own /tmp
printf '%s\n' "$@" > /tmp/mount-args # leak-guard: allow absolute-path the chroot's own /tmp
MOUNT
chmod 0755 "$root/usr/sbin/mount"
drive=C:
acme="$drive\\Work\\acme"
import_mount() { # <stdin text>: runs import-mount as root, prints its output, returns its exit code
  printf '%s' "$1" | chroot "$root" "$updater" import-mount 2>/dev/null
}
code=0; import_mount "$acme
" >/dev/null || code=$?
[ "$code" -eq 1 ] || fail "a missing /mnt/halonic gave exit $code, not 1"
ln -s /tmp "$imports"
code=0; import_mount "$acme
" >/dev/null || code=$?
[ "$code" -eq 1 ] || fail "a link at /mnt/halonic gave exit $code, not 1"
[ -z "$(find "$root/tmp" -maxdepth 1 -name 'import-*' -print -quit)" ] || fail "a mount point was made through the link"
rm "$imports"
install -d -m 0757 -o root -g root "$imports"
code=0; import_mount "$acme
" >/dev/null || code=$?
[ "$code" -eq 1 ] || fail "a /mnt/halonic others can write gave exit $code, not 1"
chmod 0755 "$imports"
point="$(import_mount "$acme
")" || fail "import-mount failed"
[[ "$point" =~ ^/mnt/halonic/import-[0-9a-f]{32}$ ]] || fail "import-mount printed $point"
[ "$(stat -c '%U %a' "$root$point")" = "root 700" ] || fail "the mount point isn't root's with mode 700"
uid="$(chroot "$root" id -u halonic)"
gid="$(chroot "$root" id -g halonic)"
[ "$(cat "$root/tmp/mount-args")" = "$(printf '%s\n' -t drvfs "$acme" "$point" -o "ro,noexec,nosuid,nodev,uid=$uid,gid=$gid,umask=077")" ] ||
  fail "import-mount ran mount with: $(cat "$root/tmp/mount-args")"
second="$(import_mount "$acme
")"
[ "$second" != "$point" ] || fail "two imports got the same mount point"
chroot "$root" "$updater" import-unmount "${second##*/}" >/dev/null
for folder in "$drive\\" "$drive" "$drive\\Work\\..\\x" "$drive\\Work\\.\\x" "$drive\\Work\\\\x" "$drive\\Work\\" \
  '\\server\share\x' 'c:/Work' "$acme$(printf '\tb')" ''; do
  rm -f "$root/tmp/mount-args"
  code=0; import_mount "$folder
" >/dev/null || code=$?
  [ "$code" -eq 2 ] || fail "the folder '$folder' gave exit $code, not 2"
  [ ! -e "$root/tmp/mount-args" ] || fail "the folder '$folder' was mounted"
done
code=0; import_mount "$acme
$drive\\Work\\other
" >/dev/null || code=$?
[ "$code" -eq 2 ] || fail "two folders gave exit $code, not 2"
code=0; echo "$acme" | chroot "$root" "$updater" import-mount "$acme" >/dev/null 2>&1 || code=$?
[ "$code" -eq 2 ] || fail "a folder on the command line gave exit $code, not 2"
code=0; echo "$acme" | chroot "$root" su halonic -s /bin/sh -c "$updater import-mount" >/dev/null 2>&1 || code=$?
[ "$code" -eq 2 ] || fail "halonic could mount a folder (exit $code)"
touch "$root/tmp/mount-fails"
code=0; import_mount "$acme
" >/dev/null || code=$?
rm "$root/tmp/mount-fails"
[ "$code" -eq 1 ] || fail "a failed mount gave exit $code, not 1"
[ "$(find "$imports" -mindepth 1 -maxdepth 1 | wc -l)" -eq 1 ] || fail "a failed mount left its mount point"
# import-unmount takes a name only, never a path, and halonic can't run it.
for name in ../x "$point" import-0123 import-0123456789ABCDEF0123456789ABCDEF ''; do
  code=0; chroot "$root" "$updater" import-unmount "$name" >/dev/null 2>&1 || code=$?
  [ "$code" -eq 2 ] || fail "import-unmount '$name' gave exit $code, not 2"
done
code=0; chroot "$root" su halonic -s /bin/sh -c "$updater import-unmount ${point##*/}" 2>/dev/null || code=$?
[ "$code" -eq 2 ] || fail "halonic could unmount an import (exit $code)"
chroot "$root" "$updater" import-unmount "${point##*/}" | grep -q '^unmounted' || fail "import-unmount failed"
[ ! -e "$root$point" ] || fail "import-unmount left the mount point"
rm -f "$root/usr/sbin/mount" "$root/tmp/mount-args"
# Import mounts a crash left behind: a folder named import- and 32 hex digits
# goes; a project's folder, one with another name, a link and a folder holding
# a file stay (the step never deletes contents); a second run changes nothing
# more; halonic can't run it; nothing happens with no /mnt/halonic.
stale=import-0123456789abcdef0123456789abcdef
mkdir "$imports/acme" "$imports/$stale" "$imports/import-0123" "$imports/import-0123456789ABCDEF0123456789ABCDEF" "$imports/$stale.old"
ln -s /tmp "$imports/import-fedcba9876543210fedcba9876543210"
mkdir "$imports/import-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
touch "$imports/import-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/file"
code=0; out="$(chroot "$root" "$updater" cleanup-import-mounts 2>/dev/null)" || code=$?
[ "$code" -eq 7 ] || fail "a folder with a file gave exit $code, not 7"
[ "$out" = "cleaned 1 import mounts, 1 left" ] || fail "cleanup said: $out"
[ ! -e "$imports/$stale" ] || fail "the stale mount point stayed"
for stays in acme import-0123 import-0123456789ABCDEF0123456789ABCDEF "$stale.old" import-fedcba9876543210fedcba9876543210; do
  [ -e "$imports/$stays" ] || [ -L "$imports/$stays" ] || fail "$stays was removed"
done
[ -f "$imports/import-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/file" ] || fail "a file was deleted"
code=0; chroot "$root" su halonic -s /bin/sh -c "$updater cleanup-import-mounts" 2>/dev/null || code=$?
[ "$code" -eq 2 ] || fail "halonic could clean up import mounts (exit $code)"
rm -rf "$imports"
chroot "$root" "$updater" cleanup-import-mounts | grep -q '^nothing to clean up' || fail "a missing /mnt/halonic wasn't fine"
echo "OK: image checks passed"
