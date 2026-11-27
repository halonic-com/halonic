# Decision: the WSL image version gate also counts files/dpkg-nodoc

- Task: HAL-20589
- Approval: the plan on HAL-20583, approved by Liam; Liam signs this note as the CTO
- Kind: internal

## What changes

The WSL image workflow's version gate (HAL-15161, HAL-15778) lists the files the image is built from. It now also lists `infra/wsl-image/files/dpkg-nodoc`, which `customize.sh` installs as `/etc/dpkg/dpkg.cfg.d/halonic-nodoc` to keep translations, man pages and docs out of the image.

## Why

A change to `dpkg-nodoc` gives a different image, and different behaviour on security updates, under the same version. Without the line, a pull request could change it without raising `infra/wsl-image/image-version`, and `WSL_IMAGE_MIN` could not tell the two images apart.

## Trust

The line only adds a path to the list the gate passes to `git diff --name-only`. The gate still runs nothing from the pull request and has only `contents: read`.

## Covers

- .github/
