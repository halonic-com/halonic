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
| `security-update` | `apt-get upgrade` from Debian's security archive only, at most once a day, and never while a sandbox session (`bwrap`) runs; then drops the setuid and setgid bit from any file the upgrade brought, with a `dpkg-statoverride` that keeps it off |
| `status` | prints `{"current":"<version>","previous":"<version>","securityUpdated":"<UTC time>"}`; any user may run it, but only root sees when security updates last ran. Any process named `bwrap` holds them off, so Studio can warn when that is long ago |

Exit codes: 0 done, 1 anything else (such as `/opt/halonic` missing or not root's),
2 wrong use (also: not root, or the version is already current), 3 a sandbox session
runs, 4 the SHA-256 differs, 5 the archive is refused (it can't be unpacked, has no
`bin` folder, holds device, pipe or socket files, or a link that is absolute or leads
out of the version folder), 6 nothing to roll back to.

It runs as root, so it never runs or sources a file the `halonic` user can write
(security review W2 on HAL-5407): it ships in the image, root-owned, and every
runtime file ends up root's, with no setuid bit and no group or other write.
Studio checks the archive's SHA-256 on Windows before it sends it, and the script
checks it again. `check.sh` installs, rolls back and updates three test runtimes
and checks owners and modes after each step, refuses archives with links that
leave the version folder, and runs `security-update` with a stand-in `apt-get`
that brings a new setuid program, and checks that a setuid file in
`halonic`'s home folder is left alone: the updater only looks at root's files under `/usr`.

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
