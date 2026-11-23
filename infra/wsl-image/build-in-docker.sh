#!/usr/bin/env bash
# Builds Halonic's WSL image in its build container (the Dockerfile here:
# Debian pinned by digest), then checks it with check.sh. The WSL image
# workflow, CI's installer and the release all build it this way (HAL-16773).
# Needs Docker with privileged containers: mmdebstrap mounts in its chroot.
# Usage: build-in-docker.sh <output-dir>
# Writes what build.sh writes: halonic-wsl.tar.gz, packages.txt and sizes.json.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="${1:?usage: build-in-docker.sh <output-dir>}"
mkdir -p "$out"
out="$(cd "$out" && pwd)"

# Built without a context, so it can't copy anything in.
docker build -t halonic-wsl-build - < "$here/Dockerfile"
docker run --rm --privileged \
  -v "$here:/src:ro" \
  -v "$out:/out" \
  halonic-wsl-build bash -euxc '
    /src/build.sh /out
    /src/check.sh /out/halonic-wsl.tar.gz
  '
