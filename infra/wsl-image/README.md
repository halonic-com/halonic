# Halonic WSL image

Halonic's own minimal Debian image for the `srt-wsl` sandbox on Windows
(design: HAL-3779, section 5.2). **Build only.** Publishing the image is a
release and needs the board's yes.

- `snapshot.conf`: the pinned Debian suite and snapshot date.
- `build.sh <dir>`: builds `halonic-wsl.tar.gz` with `mmdebstrap --variant=minbase`,
  and writes `sizes.json` (download and on-disk size) and `packages.txt`.
- `customize.sh`: the step inside the build that adds our files, the user and the notices.
- `check.sh <image>`: checks config, packages, licence notice and that the tools start.
- `files/`: `/etc/wsl.conf` (interop off, automount off, user `halonic`, systemd off),
  the empty `/opt/halonic` runtime slot, and the licence notice.

Locally (Debian or Ubuntu, as root): `apt-get install mmdebstrap` then
`sudo infra/wsl-image/build.sh out && sudo infra/wsl-image/check.sh out/halonic-wsl.tar.gz`.

CI: `.github/workflows/wsl-image.yml` runs on changes here and by hand, prints
the sizes in the job summary, and keeps the image as a 7-day build artifact.
The image is imported on Windows with
`wsl --import halonic %LOCALAPPDATA%\Halonic\wsl halonic-wsl.tar.gz --version 2`.

Licences: the image carries Debian's per-package `copyright` files plus
`/usr/share/doc/halonic-image/NOTICE`, `SNAPSHOT.txt` and `packages.txt` (the
source pointer). Whoever owns licence compliance checks this before the first
release.
