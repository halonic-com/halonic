# Decision: a CI workflow that builds Halonic's WSL image

- Task: HAL-5390 (WSL image, design HAL-3779 section 5.2; ADR 2026-11-11-pluggable-sandbox-layer)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-5390](/HAL/issues/HAL-5390)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hnma5Pbcvf3inyEzieS6HDxrNHMqrBhiwJOfU+CukUuzoY6z8zXnoTSMVsMIfTMnPP37TuRUpb65q7yCLoSECQ==

## What changes

A new workflow `.github/workflows/wsl-image.yml` builds the image from `infra/wsl-image/` with mmdebstrap inside a privileged `debian:trixie` container on an Ubuntu runner (mmdebstrap needs root and a current Debian keyring), checks it, writes its download and on-disk size into the job summary, and keeps it as a build artifact for 7 days. It runs by hand and on changes to its own files only. It has read-only repository rights and no secrets. It publishes nothing: publishing the image is a release and needs the board's yes.

## Why

The Windows sandbox default runs srt inside Halonic's own WSL distro, and Noah needs the real download and disk size.

## Tests

`infra/wsl-image/check.sh` runs in the workflow: config, packages, licence notice, source pointer, user, and that the tools start.

## Covers

- .github/
