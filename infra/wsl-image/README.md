# Halonic WSL image

Halonic's own minimal Debian image for the `srt-wsl` sandbox on Windows
(design: HAL-3779, section 5.2). It reaches users only inside the Windows
installer (board, option A on HAL-16772): `build-installer.ps1 -Image` puts
`halonic-wsl.tar.gz` next to the app, where the shell's WSL setup imports it
(HAL-16773). Nothing publishes it on its own.

- `snapshot.conf`: the pinned Debian suite and snapshot date.
- `build.sh <dir>`: builds `halonic-wsl.tar.gz` with `mmdebstrap --variant=minbase`,
  and writes `sizes.json` (download and on-disk size) and `packages.txt`.
- `customize.sh`: the step inside the build that adds our files, the user and the
  notices, and removes every setuid and setgid bit (kept off on upgrades with
  `dpkg-statoverride`): root in this distro can mount the Windows drive.
- `build-in-docker.sh <dir>`: runs `build.sh` and `check.sh` in the container
  from `Dockerfile`, as the WSL image workflow, CI's installer and the release do.
- `check.sh <image>`: checks config, packages, licence notice, that no setuid or
  setgid file and no file capability is left, that the tools start, and the
  runtime updater (below).
- `runtime-archive.sh <halonic-agent-host> <version> <dir>`: packs the runtime
  (below) as `halonic-runtime.tar.gz`, and writes `halonic-runtime.json` with its
  version, SHA-256 and size.
- `Dockerfile`: the build container, `debian:trixie` pinned by digest. Dependabot
  proposes new digests.
- `files/`: `/etc/wsl.conf` (interop off, automount and `/etc/fstab` mounts off, user `halonic`, systemd off),
  the empty `/opt/halonic` runtime slot, the runtime updater, the licence notice and
  `dpkg-nodoc`, which leaves translations, man pages and docs out (below).

## The runtime updater

`/usr/local/sbin/halonic-runtime` (HAL-5396, design section 5.3) puts the Halonic
runtime in `/opt/halonic/<version>` and points `/opt/halonic/current` at it. Studio
runs it as root from Windows, with `wsl.exe` by its full path and no shell:

```
%SystemRoot%\System32\wsl.exe -d halonic -u root --cd / --exec /usr/local/sbin/halonic-runtime install <version> <sha256> < runtime.tar.gz
```

The shell runs `install` each time it starts the host in the distro and `status`
names another `current` than the runtime beside the app (`halonic-runtime.tar.gz`
and its `halonic-runtime.json`, from `runtime-archive.sh`), with a 5-minute limit
(HAL-14644).

| Command | What it does |
| --- | --- |
| `install <version> <sha256>` | reads the archive on standard input, checks its SHA-256, unpacks it as root's files, puts the version's updater in place (below), switches `current`, keeps the version before as `previous` and removes older ones |
| `rollback` | swaps `current` and `previous`, and puts the updater of the version it goes back to in place |
| `security-update` | `apt-get upgrade` from Debian's security archive only, at most once a day, and never while a sandbox session (`bwrap`) runs. It first runs `dpkg --configure -a`, so an update Studio's time limit cut off inside dpkg finishes, instead of every later `apt-get` refusing (HAL-12672). After that and after the upgrade, it drops the setuid and setgid bit from any file under `/usr` the upgrade brought, whoever owns it, with a `dpkg-statoverride` that keeps it off, and removes every file capability under `/usr` (a package script may run `setcap`). It drops them even when `dpkg` or the upgrade fails, then fails with that exit code (HAL-12766) |
| `import-mount` | reads one Windows drive folder (one line) on standard input, never from the command line (W7), and checks it as the engine does: an absolute drive path with at least one folder, no empty, `.` or `..` segment and no control character. Mounts it with `ro,noexec,nosuid,nodev,uid=<halonic>,gid=<halonic>,umask=077` at a fresh `/mnt/halonic/import-<32 hex digits>` and prints that path. The files belong to `halonic`, so the engine runs `git` and the copy as `halonic`, never as root (W2b, HAL-12443). `/mnt/halonic` must be a real folder of root's that nobody else can write (`wsl.conf` makes it at every start), and every session denies it as a whole (W1). A failed mount removes its mount point |
| `import-unmount <name>` | unmounts the import mount `<name>` (`import-` and 32 lowercase hex digits, a name, never a path) and removes its mount point with `rmdir` |
| `cleanup-import-mounts` | no arguments, no input. Unmounts and removes the import mounts a crash or kill left under `/mnt/halonic` (HAL-5402). It only touches a real folder (never a link) directly under it, named `import-` and 32 lowercase hex digits, and only with `umount` and `rmdir`, so it never deletes a file. A mount point it can't clean is reported on standard error and the others go on; running it again changes nothing more. Studio runs it before it starts the host, with a 20-second limit, and starts the host whatever it says |
| `status` | prints `{"current":"<version>","previous":"<version>","securityUpdated":"<UTC time>","image":"<image version>"}`; any user may run it, but only root sees when security updates last ran. Any process named `bwrap` holds them off, so Studio can warn when that is long ago. `image` is empty for an image that records no version (below) |

Exit codes: 0 done, 1 anything else (such as `/opt/halonic` missing or not root's),
2 wrong use (also: not root, or the version is already current), 3 a sandbox session
runs, 4 the SHA-256 differs, 5 the archive is refused (it can't be unpacked, has no
`bin` folder, holds device, pipe or socket files, a link that is absolute or leads
out of the version folder, an `sbin/halonic-runtime` that isn't a plain file, or an
updater that doesn't start), 6 nothing to roll back to, 7 a mount point could not be unmounted or removed (by `cleanup-import-mounts`: the others were), 8 another `install`, `rollback` or `security-update` is still running.

**One step at a time (HAL-15134).** Studio stops a step that takes too long by
killing `wsl.exe`, which doesn't stop the updater inside the distro, so a retry
can start while the stopped step still runs. `install`, `rollback` and
`security-update` therefore take one lock (`flock` on `/var/lib/halonic/lock`,
root's only) before they read or change anything, and hold it to the end. One
that waits more than 60 seconds for it changes nothing and exits 8 (`WslError::UpdateRunning`
in the shell); Studio tries again at the next start. Each `install` also unpacks
into a folder of its own (`/opt/halonic/.incoming-<version>.XXXXXX`), so one run
never removes another's files while they are checked, and the folders a stopped
install left go at the next install, which holds the lock. `apt-get` and `dpkg`
run without the lock's file descriptor, so a daemon a package script starts can't
keep it. The import commands and `status` take no lock: they never touch
`/opt/halonic`, and `cleanup-import-mounts` only runs `umount` and `rmdir`, which
are safe to run twice; holding it behind a long security update would only leave
stale mounts in place.

**How a changed updater reaches a distro (HAL-15161).** The runtime archive
carries the updater as `sbin/halonic-runtime`, so a new updater arrives with the
next runtime, without importing the distro again (which would delete the
projects kept in it, `sandbox-srt.wsl-remove`). After `install` has checked the
archive's SHA-256 and unpacked it as root's files, and before it switches
`current`, it puts that version's `sbin/halonic-runtime` at
`/usr/local/sbin/halonic-runtime`: it must be a plain file (a link is refused,
exit 5), it is copied to a temporary file in the same folder, made root's
`0755`, synced and run once (`status`), and only then renamed over the old one.
A copy that doesn't start is refused (exit 5) and nothing changes. The image's
own updater is kept once as `/usr/local/sbin/.halonic-runtime.image`, and a
version without `sbin/halonic-runtime` gets that copy back, so the updater
always belongs to `current`, also after `rollback`, which puts the target
version's updater in place the same way. `/usr/local/sbin` is root's alone
(`customize.sh` makes it `0755`, and the updater refuses it otherwise). The
image still carries the updater, so a new distro works before its first runtime.

It runs as root, so it never runs or sources a file the `halonic` user can write
(security review W2 on HAL-5407): it is root-owned, a new copy comes only from a
checked, root-owned version folder, and every runtime file ends up root's, with
no setuid bit and no group or other write. Studio checks the archive's SHA-256
on Windows before it sends it, against the value in its own build, and the
script checks it again. `check.sh` installs, rolls back and updates three test runtimes
and checks owners and modes after each step, refuses archives with links that
leave the version folder, holds one install on a pipe while a rollback gives up
with exit 8 and a second install waits and then runs, so both versions end up
complete and no unpack folder is left, installs a version that carries a new
updater, one without (which gets the image's copy back) and rolls back to the
first (which brings its updater back), refuses an updater that is a link or
doesn't start without changing anything, and runs `security-update` with a stand-in `apt-get`
that brings a new setuid program, a setgid program of another system user and a
program with a file capability, and checks that a setuid file in `halonic`'s home
folder is left alone: the updater only looks under `/usr`. With an offline stand-in, it checks that a half-configured package is finished and its package script's file capability dropped, even though the update fails, and that a package script that sets a capability and then fails, in `dpkg --configure -a` or in the upgrade, leaves no setuid bit or capability behind. It also runs `import-mount` with a stand-in `mount` (the chroot has no `drvfs`): with good and bad folders, two folders, a folder on the command line, a failed mount, and with `/mnt/halonic` missing, a link or writable by others; `import-unmount` with names that aren't one; and `cleanup-import-mounts` with no `/mnt/halonic`, with a matching mount point, a project's folder, a wrong name, a link and a folder that holds a file. `halonic` can run none of the three.

## The runtime archive

The runtime is the Linux agent host executable (`apps/agent-host`, `pnpm build:sea`),
which carries Node, the engine and srt. `runtime-archive.sh` packs it as
`bin/halonic-agent-host`, the path the shell starts (`DISTRO_HOST` in
`apps/studio/src-tauri/crates/agent-host/src/wsl.rs`), with the updater from
`files/halonic-runtime` as `sbin/halonic-runtime`, and checks the version
with the updater's rule. The archive is reproducible: the same executable and
version give the same bytes, so the SHA-256 Studio pins can be checked by
building again. CI's `wsl-runtime` job packs it on every pull request that
changes the host or the Windows shell, with the version
`<Studio version>+<12-digit commit>`, and keeps it for 7 days
(`halonic-wsl-runtime`). The Windows installer ships it next to the app
(`build-installer.ps1 -Runtime`, HAL-15136), and the shell installs it in the
distro at host start (HAL-14644). The release builds it the same way with the
tag's version; it reaches users only inside an installer the board released. `check.sh`
packs a stand-in host twice, compares the bytes and installs it with the updater.

Locally (Debian or Ubuntu, as root): `apt-get install mmdebstrap libcap2-bin` then
`sudo infra/wsl-image/build.sh out && sudo infra/wsl-image/check.sh out/halonic-wsl.tar.gz`.

## The image version

`image-version` holds one whole number, the image's own version (HAL-15161).
`customize.sh` writes it to `/usr/share/doc/halonic-image/IMAGE` and `status`
reports it as `image`. Raise it by one whenever something only a new image brings
changes: `Dockerfile` (the build container), `build.sh` (the package list),
`customize.sh`, `snapshot.conf`, `files/wsl.conf`, `files/opt-halonic-README`,
`files/NOTICE` or `files/dpkg-nodoc`; the WSL image workflow fails a pull request that changes one of
them without it, and one that lowers the number (HAL-15778). A Dependabot pull
request for the `Dockerfile` needs a commit that raises it too. A change to the
updater alone needs no raise, as it travels with the runtime. Studio names the lowest image it works with (`WSL_IMAGE_MIN` in
`packages/adapters/sandbox-srt/src/wsl-setup/runtime.ts`); the setup reports an
older distro as `image-outdated` and never re-imports it on its own, since that
deletes what is kept in it.

CI: `.github/workflows/wsl-image.yml` builds in the container from `Dockerfile`,
runs on changes here and by hand, prints the sizes in the job summary, and keeps the image as a 7-day build artifact.
CI's `wsl-image` job builds it the same way whenever the Windows installer job
runs, which ships it; the release builds it from the tag's commit. Both check
the SHA-256 in `sizes.json` against the image before it goes into the installer.
The image is imported on Windows with
`wsl --import halonic %LOCALAPPDATA%\Halonic\wsl halonic-wsl.tar.gz --version 2`.

Licences: the image carries Debian's per-package `copyright` files plus
`/usr/share/doc/halonic-image/NOTICE`, `SNAPSHOT.txt` and `packages.txt` (the
source pointer). Nothing else in `/usr/share/doc`, `/usr/share/man` or
`/usr/share/locale` (HAL-20583): `customize.sh` removes it, and
`/etc/dpkg/dpkg.cfg.d/halonic-nodoc` (from `files/dpkg-nodoc`) keeps security
updates from bringing it back. A doc folder that is a link to another package's
stays: dpkg keeps folders and links above an included path. `check.sh` checks
both, with invented packages for a later install (one with its doc folder as a
link), and that every installed package has its `copyright`
file. Whoever owns licence compliance checks this before the first
release that ships the image in the installer.
