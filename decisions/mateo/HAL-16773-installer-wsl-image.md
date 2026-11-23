# Decision: the Windows installer ships the WSL image

- Task: HAL-16773
- Approval: the board chose option A (the installer ships the image) on HAL-16772; Liam reviews the workflow change and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2dKMkDb/OA2rG5tnyf78t7BaUQ0N/qtJ/IEmC4v2So2iAXJzjS1ypL2pRBxWD5A1wDiv6jgJxUI4+CUGzvrUCQ==

## What changes

- `windows/build-installer.ps1` gets `-Image <folder>`, next to `-Runtime`. With it, the script stops when `halonic-wsl.tar.gz` or `sizes.json` (both written by `infra/wsl-image/build.sh`) is missing or the SHA-256 in `sizes.json` isn't the image's, copies the image into `src-tauri/binaries/` and adds `tauri.image.conf.json`, which installs it next to `Halonic.exe` as `halonic-wsl.tar.gz`, the file the shell's WSL setup passes to `--wsl-image` (HAL-16771). Only the image ships: `sizes.json` checks the build, and nothing reads it on the PC. Without `-Image`, nothing changes.
- `infra/wsl-image/build-in-docker.sh`: the container build and check the WSL image workflow ran inline, now one script that it, CI and the release share. It changes nothing in the image, so `image-version` stays.
- `ci.yml`: a new Linux job, `wsl-image` (about 4 minutes, in parallel with `wsl-runtime`), builds and checks the image under the same conditions as `installer-windows`, which now needs it, downloads `halonic-wsl-image` and builds with `-Image`. The install check lists `halonic-wsl.tar.gz`. `wsl-image` is added to `ci-ok`, and the installer area now also covers the image's build files. Same read-only rights, no secrets, publishes nothing.
- `release.yml`: a new Linux job, `wsl-image`, builds and checks the image from the tag's commit, as a 7-day artifact, with no cache. `studio` needs it and builds with `-Image`; `sign-test` and `sign-windows` download it and pack with `-Image`; `sign-test` checks the image is installed. It holds no secret, and the image isn't a release file of its own: it reaches users only inside an installer the board has released. No approval gate changes.
- `installer.nsi`: page 1 says "Uses about 290 MB" instead of 200 (the 92 MB image on top), because CI fails when the size is off by a quarter. The installer download grows from about 95 MB to about 190 MB, as the board was told.
- New requirement `studio.installer-wsl-image`, with tests.
- `tooling/check/src/test/ci-desktop-hourly.test.ts`: `wsl-image` joins the hourly macOS and Windows set next to `wsl-runtime`, as a Linux job built for Windows, because the hourly installer run needs the image. The guard's own code and trust roots don't change.

## Why

The board chose option A on HAL-16772: the installer ships the image, so the WSL setup works offline, with no new network address, and the image is pinned to the build, as the runtime is (HAL-15093, HAL-15136). `wsl --import` doesn't check what it imports, so checking the image against the SHA-256 its build wrote stops a truncated or mixed-up artifact before it ships rather than in a setup on the user's PC.

Open before the first release that ships it: the image carries Debian's per-package `copyright` files, its `NOTICE` and the snapshot it was built from (`infra/wsl-image/README.md`, Licences). Shipping it in the installer is distributing it, so licence compliance checks this in the release review.

## Covers

- studio.installer-wsl-image
- .github/
- tooling/check/
