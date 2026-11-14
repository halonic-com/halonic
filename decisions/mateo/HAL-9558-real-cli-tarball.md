# Decision: release.yml builds the real CLI tarball and no longer refuses real runs

- Task: HAL-9558
- Approval: Liam approves this note in review on HAL-9558
- Kind: internal
- Signature: ed25519:sha256:UNSIGNED:UNSIGNED

## What changes

In `.github/workflows/release.yml`, the `build` job drops the "Refuse a real release until the real build exists" step and the placeholder CLI package. It builds the real `halonic` tarball with `stage-cli` (`tooling/publish`), packs it as `halonic-cli-<version>.tgz`, installs it into an empty folder and runs `halonic --version` and `halonic doctor`. No trigger, permission, secret or other job changes. The new requirement `publish.staged-cli` describes the stager.

## Why

Real runs failed with "The CLI package is still a stub", so 0.1.0 could not be released from `main` (HAL-9546, HAL-9555).

## Covers

- .github/
- publish.staged-cli
