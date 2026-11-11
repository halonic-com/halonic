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
  setgid file is left, and that the tools start.
- `files/`: `/etc/wsl.conf` (interop off, automount and `/etc/fstab` mounts off, user `halonic`, systemd off),
  the empty `/opt/halonic` runtime slot, the runtime updater and the licence notice.

## The runtime updater

`/usr/local/sbin/halonic-runtime` (HAL-5396, design section 5.3) puts the Halonic
runtime in `/opt/halonic/<version>` and points `/opt/halonic/current` at it. Studio
runs it as root from Windows, with `wsl.exe` by its full path and no shell:

```
%SystemRoot%\System32\wsl.exe -d halonic -u root --exec /usr/local/sbin/halonic-runtime install <version> <sha256> < runtime.tar.gz
```

| Command | What it does |
| --- | --- |
| `install <version> <sha256>` | reads the archive on standard input, checks its SHA-256, unpacks it as root's files, switches `current`, keeps the version before as `previous` and removes older ones |
| `rollback` | swaps `current` and `previous` |
| `security-update` | `apt-get upgrade` from Debian's security archive only, at most once a day, and never while a sandbox session (`bwrap`) runs |
| `status` | prints `{"current":"<version>","previous":"<version>"}`; any user may run it |

Exit codes: 0 done, 2 wrong use (also: not root), 3 a sandbox session runs, 4 the
SHA-256 differs, 5 the archive is refused (no `bin` folder, or device, pipe or
socket files), 6 nothing to roll back to.

It runs as root, so it never runs or sources a file the `halonic` user can write
(security review W2 on HAL-5407): it ships in the image, root-owned, and every
runtime file ends up root's, with no setuid bit and no group or other write.
Studio checks the archive's SHA-256 on Windows before it sends it, and the script
checks it again. `check.sh` installs, rolls back and updates three test runtimes
and checks owners and modes after each step.

Locally (Debian or Ubuntu, as root): `apt-get install mmdebstrap` then
`sudo infra/wsl-image/build.sh out && sudo infra/wsl-image/check.sh out/halonic-wsl.tar.gz`.

CI: `.github/workflows/wsl-image.yml` builds in a `debian:trixie` container pinned
by digest, runs on changes here and by hand, prints
the sizes in the job summary, and keeps the image as a 7-day build artifact.
The image is imported on Windows with
`wsl --import halonic %LOCALAPPDATA%\Halonic\wsl halonic-wsl.tar.gz --version 2`.

Licences: the image carries Debian's per-package `copyright` files plus
`/usr/share/doc/halonic-image/NOTICE`, `SNAPSHOT.txt` and `packages.txt` (the
source pointer). Whoever owns licence compliance checks this before the first
release.
