# Decision: pin the WSL image's build container by digest

- Task: HAL-5845 (follow-up from the security review of #1830, HAL-5390; rows W2 and W4 of the HAL-5407 review)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-5845](/HAL/issues/HAL-5845)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:O1JFQf6H8M5Llpf6MtlPlO7l022MiP+tq/cd6TSHHtSqs6humtg7N9ZGgll8vbU6+ebFymiVY1948bjpR5kRCw==

## What changes

`.github/workflows/wsl-image.yml` runs its build in `debian:trixie` pinned by digest instead of the moving tag. Nothing else in the workflow changes: same triggers, same read-only rights, no secrets, publishes nothing.

## Why

The Debian archive keyring that checks every package in the image comes from that container, so it is the image's trust root. A moving tag would let a changed container change what the build trusts without a review.

## Tests

The workflow's own run on this pull request builds the image and runs `infra/wsl-image/check.sh`, which now also checks `mountFsTab=false`, each `enabled=false` under its own section, no `deb-src`, and that no file is setuid or setgid.

## Covers

- .github/
