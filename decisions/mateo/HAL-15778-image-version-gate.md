# Decision: the WSL image version gate covers every file the image is built from, and refuses a lower version

- Task: HAL-15778
- Approval: Liam's review of #4773 (HAL-15619) asked for it; Liam reviews it as a security PR and signs this note as the CTO
- Kind: internal

## What changes

The WSL image workflow's version gate (HAL-15161) failed a pull request that changed `build.sh`, `customize.sh`, `snapshot.conf` or `files/wsl.conf` without raising `infra/wsl-image/image-version`. It now also counts `Dockerfile`, `files/opt-halonic-README` and `files/NOTICE`, and it fails a pull request that lowers the number, whether or not anything else changed, or that leaves it as anything but one whole number.

## Why

`customize.sh` copies `opt-halonic-README` and `NOTICE` into the image, and the `Dockerfile` brings the `mmdebstrap` and archive keyring that build it, so a change to any of them gives a different image under the same version. A lower number would reuse a version an earlier image already had, and `WSL_IMAGE_MIN` would then accept an image it shouldn't. `halonic-runtime` stays out of the list: it travels with the runtime (HAL-15161 A).

Dependabot's weekly digest bump of the `Dockerfile` now fails the gate until someone adds a commit that raises the version. That is the cost of counting the build container, and the README says so.

## Trust

The gate reads two copies of a one-line file from this repo (the base commit's and the pull request's) and compares them as numbers only after checking both are digits. It runs nothing from the pull request and has only `contents: read`.

## Covers

- .github/
