# Decision: publish-kit on main accepts a run by hand from a release branch

- Approval: HAL-11895, ported from the reviewed release/0.1.1 change (HAL-11856)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:L3yfCGtgNeFxbpWPPZ3ovgT8qk6ILM5YQimQJOko07+c8CqA+fA3OQw3TvQJwFNpHc/lrmPmAQLdNSXej26LBg==

`publish-kit.yml` on `main` gets the same gate as the 0.1.1 patch branch:
a run started by hand also works on a `release/*` branch, so a later patch
branch cut from `main` has the route from the start. Dry run stays on by
default, a push still publishes only from `main`, and npm's 2FA approval of
staged versions still gates every release.

## Covers

- .github/
