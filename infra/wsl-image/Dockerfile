# The container the WSL image is built and checked in (HAL-6181).
# Debian, so mmdebstrap and the archive keyring are new enough for the current
# stable release (Ubuntu's are not). Pinned by digest: its archive keyring
# checks every package in the image (HAL-5845). Dependabot proposes new digests.
FROM debian:trixie@sha256:9c6e381421d0f48d1b8133e573f33c185ee16cbf505eda9c4a8a4791b25ea8a6
# libcap2-bin: getcap and setcap for check.sh.
RUN apt-get update \
 && apt-get install -y --no-install-recommends mmdebstrap debian-archive-keyring ca-certificates tar gzip libcap2-bin \
 && rm -rf /var/lib/apt/lists/*
