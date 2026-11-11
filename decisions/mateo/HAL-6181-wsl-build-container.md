# Decision: build the WSL image in a Dockerfile that Dependabot keeps fresh

- Task: HAL-6181 (follow-up from Julian's security review of #1894, HAL-5845 and HAL-6098)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-6181](/HAL/issues/HAL-6181)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:HnXZiudItBybR1pJheHxsDTxZhS9k1tX7UoyZ0pAyxSIKn2UhRxd9uoo1JSICckmfvMO2PDdnBamJ96sM/r7BA==

## What changes

- `.github/workflows/wsl-image.yml` builds `infra/wsl-image/Dockerfile` (the same `debian:trixie` digest, plus the same packages and `libcap2-bin`) and runs the build and check in it, instead of `docker run` on a digest written in the workflow. It builds without a context, so nothing from the repo is copied into the container. Same triggers, same read-only rights, no secrets, publishes nothing.
- `.github/dependabot.yml` watches `/infra/wsl-image` with the `docker` ecosystem, weekly, with the same 7-day cooldown as the gitleaks image.

## Why

The container's archive keyring checks every package in the image. A digest on a `docker run` line can't be updated by Dependabot, so it would go stale and miss base-image fixes unless someone remembers. In a `FROM` line, Dependabot proposes each new digest as a pull request, and that pull request runs this workflow.

## Tests

The workflow's own run on this pull request builds the container and the image and runs `infra/wsl-image/check.sh`, which now extracts with `--xattrs --xattrs-include='*'` and fails on any file capability (empty allow list). A canary file with `cap_net_raw` first proves the extraction and `getcap` see capabilities, so the check can't pass by being blind.

## Covers

- .github/
