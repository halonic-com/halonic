# Decision: release/0.1.1 carries the reviewed CI fix and lets publish-kit run from a release branch

- Approval: HAL-9305, route A chosen by the board for 0.1.1; HAL-11232 for the cherry-picked CI fix
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:fZ3yLMCT0ioKfBIrSfBZpXdO7QGEMfpVLGtUq7ITq0o+hWGO2vZEkQR23sZY46EgzuRHjBsHHzDRAv8E1IIxBQ==

The 0.1.1 branch starts at `88368d82` and takes only the fixes from the
0.1.1 release review. Two of its commits change `.github/`:

- the F7.1 fix from `main` (#3206), unchanged, so the leak terms and the
  release bot token stay in protected environments. Its own note,
  `HAL-11232-ci-secret-environments.md`, comes along as it was reviewed;
- `publish-kit.yml` also accepts a run started by hand from a `release/*`
  branch, so 0.1.1 can be published from this branch. Dry run stays on by
  default, a push still publishes only from `main`, and npm's 2FA approval
  of staged versions still gates every release.

## Covers

- .github/
