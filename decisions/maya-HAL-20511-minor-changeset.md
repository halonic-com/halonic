# Decision: the changesets rule allows a minor bump for the 0.2.0 release

- Approval: HAL-20511 (Liam, CTO)
- Kind: internal
- Signature: unsigned, to be signed from a clean worktree of `origin/main`
- Task: HAL-20511

## Covers

- `check.changesets-patch-only`

## What changes

- `maxBump` in `tooling/check/src/rules/changesets.ts` goes from `patch` to `minor`.
- The requirement and its examples now say a `minor` changeset passes and a `major` one fails.

## Why

The board approved 0.2.0 on HAL-17109. The one `minor` changeset that makes the Version packages
PR say 0.2.0 can't land while the rule caps bumps at `patch`. A follow-up PR sets the cap back to
`patch` once the release has merged.
