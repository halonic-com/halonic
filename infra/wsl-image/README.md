# Halonic WSL image

Halonic's own minimal Debian image for the `srt-wsl` sandbox on Windows
(design: HAL-3779, section 5.2). **Build only.** Publishing the image is a
release and needs the board's yes.

- `snapshot.conf`: the pinned Debian suite and snapshot date.
- `build.sh <dir>`: builds `halonic-wsl.tar.gz` with `mmdebstrap --variant=minbase`,
  and writes `sizes.json` (download and on-disk size) and `packages.txt`.
- `customize.sh`: the step inside the build that adds our files, the user and the
  notices, and removes every setuid and setgid bit (kept off on upgrades with
  `dpkg-statoverride`): root in this distro can mount the Windows drive.
- `check.sh <image>`: checks config, packages, licence notice, that no setuid or
  setgid file and no file capability is left, that the tools start, and the
  runtime updater (below).
- `runtime-archive.sh <halonic-agent-host> <version> <dir>`: packs the runtime
  (below) as `halonic-runtime.tar.gz`, and writes `halonic-runtime.json` with its
  version, SHA-256 and size.
- `Dockerfile`: the build container, `debian:trixie` pinned by digest. Dependabot
  proposes new digests.
- `files/`: `/etc/wsl.conf` (interop off, automount and `/etc/fstab` mounts off, user `halonic`, systemd off),
  the empty `/opt/halonic` runtime slot, the runtime updater and the licence notice.

## The runtime updater

`/usr/local/sbin/halonic-runtime` (HAL-5396, design section 5.3) puts the Halonic
runtime in `/opt/halonic/<version>` and points `/opt/halonic/current` at it. Studio
runs it as root from Windows, with `wsl.exe` by its full path and no shell:

```
%SystemRoot%\System32\wsl.exe -d halonic -u root --cd / --exec /usr/local/sbin/halonic-runtime install <version> <sha256> < runtime.tar.gz
```

| Command | What it does |
| --- | --- |
| `install <version> <sha256>` | reads the archive on standard input, checks its SHA-256, unpacks it as root's files, switches `current`, keeps the version before as `previous` and removes older ones |
| `rollback` | swaps `current` and `previous` |
| `security-update` | `apt-get upgrade` from Debian's security archive only, at most once a day, and never while a sandbox session (`bwrap`) runs. It first runs `dpkg --configure -a`, so an update Studio's time limit cut off inside dpkg finishes, instead of every later `apt-get` refusing (HAL-12672). After that and after the upgrade, it drops the setuid and setgid bit from any file under `/usr` the upgrade brought, whoever owns it, with a `dpkg-statoverride` that keeps it off, and removes every file capability under `/usr` (a package script may run `setcap`). It drops them even when `dpkg` or the upgrade fails, then fails with that exit code (HAL-12766) |
| `import-mount` | reads one Windows drive folder (one line) on standard input, never from the command line (W7), and checks it as the engine does: an absolute drive path with at least one folder, no empty, `.` or `..` segment and no control character. Mounts it with `ro,noexec,nosuid,nodev,uid=<halonic>,gid=<halonic>,umask=077` at a fresh `/mnt/halonic/import-<32 hex digits>` and prints that path. The files belong to `halonic`, so the engine runs `git` and the copy as `halonic`, never as root (W2b, HAL-12443). `/mnt/halonic` must be a real folder of root's that nobody else can write (`wsl.conf` makes it at every start), and every session denies it as a whole (W1). A failed mount removes its mount point |
| `import-unmount <name>` | unmounts the import mount `<name>` (`import-` and 32 lowercase hex digits, a name, never a path) and removes its mount point with `rmdir` |
| `cleanup-import-mounts` | no arguments, no input. Unmounts and removes the import mounts a crash or kill left under `/mnt/halonic` (HAL-5402). It only touches a real folder (never a link) directly under it, named `import-` and 32 lowercase hex digits, and only with `umount` and `rmdir`, so it never deletes a file. A mount point it can't clean is reported on standard error and the others go on; running it again changes nothing more. Studio runs it before it starts the host, with a 20-second limit, and starts the host whatever it says |
| `status` | prints `{"current":"<version>","previous":"<version>","securityUpdated":"<UTC time>"}`; any user may run it, but only root sees when security updates last ran. Any process named `bwrap` holds them off, so Studio can warn when that is long ago |

Exit codes: 0 done, 1 anything else (such as `/opt/halonic` missing or not root's),
2 wrong use (also: not root, or the version is already current), 3 a sandbox session
runs, 4 the SHA-256 differs, 5 the archive is refused (it can't be unpacked, has no
`bin` folder, holds device, pipe or socket files, or a link that is absolute or leads
out of the version folder), 6 nothing to roll back to, 7 a mount point could not be unmounted or removed (by `cleanup-import-mounts`: the others were).

It runs as root, so it never runs or sources a file the `halonic` user can write
(security review W2 on HAL-5407): it ships in the image, root-owned, and every
runtime file ends up root's, with no setuid bit and no group or other write.
Studio checks the archive's SHA-256 on Windows before it sends it, and the script
checks it again. `check.sh` installs, rolls back and updates three test runtimes
and checks owners and modes after each step, refuses archives with links that
leave the version folder, and runs `security-update` with a stand-in `apt-get`
that brings a new setuid program, a setgid program of another system user and a
program with a file capability, and checks that a setuid file in `halonic`'s home
folder is left alone: the updater only looks under `/usr`. With an offline stand-in, it checks that a half-configured package is finished and its package script's file capability dropped, even though the update fails, and that a package script that sets a capability and then fails, in `dpkg --configure -a` or in the upgrade, leaves no setuid bit or capability behind. It also runs `import-mount` with a stand-in `mount` (the chroot has no `drvfs`): with good and bad folders, two folders, a folder on the command line, a failed mount, and with `/mnt/halonic` missing, a link or writable by others; `import-unmount` with names that aren't one; and `cleanup-import-mounts` with no `/mnt/halonic`, with a matching mount point, a project's folder, a wrong name, a link and a folder that holds a file. `halonic` can run none of the three.

## The runtime archive

The runtime is the Linux agent host executable (`apps/agent-host`, `pnpm build:sea`),
which carries Node, the engine and srt. `runtime-archive.sh` packs it as
`bin/halonic-agent-host`, the path the shell starts (`DISTRO_HOST` in
`apps/studio/src-tauri/crates/agent-host/src/wsl.rs`), and checks the version
with the updater's rule. The archive is reproducible: the same executable and
version give the same bytes, so the SHA-256 Studio pins can be checked by
building again. CI's Linux agent host job packs it on every pull request that
changes the host, with the version `<Studio version>+<12-digit commit>`, and
keeps it for 7 days (`halonic-wsl-runtime`). Build only: Studio doesn't bundle
or install it yet (HAL-14644), and publishing it is a release. `check.sh`
packs a stand-in host twice, compares the bytes and installs it with the updater.

Locally (Debian or Ubuntu, as root): `apt-get install mmdebstrap libcap2-bin` then
`sudo infra/wsl-image/build.sh out && sudo infra/wsl-image/check.sh out/halonic-wsl.tar.gz`.

CI: `.github/workflows/wsl-image.yml` builds in the container from `Dockerfile`,
runs on changes here and by hand, prints the sizes in the job summary, and keeps the image as a 7-day build artifact.
The image is imported on Windows with
`wsl --import halonic %LOCALAPPDATA%\Halonic\wsl halonic-wsl.tar.gz --version 2`.

Licences: the image carries Debian's per-package `copyright` files plus
`/usr/share/doc/halonic-image/NOTICE`, `SNAPSHOT.txt` and `packages.txt` (the
source pointer). Whoever owns licence compliance checks this before the first
release.
