# Decision: the changesets rule allows a minor bump for the 0.2.0 release

- Approval: the Paperclip task HAL-20511, where Liam decided to raise the cap in this pull request; the board approved 0.2.0 on HAL-17109
- Kind: internal

## Covers

- check.changesets-patch-only
- tooling/check/

## What changes

- `maxBump` in `tooling/check/src/rules/changesets.ts` goes from `patch` to `minor`.
- The requirement `check.changesets-patch-only` and its tests now say a `minor` changeset passes and a `major` one fails.

## Why

The board approved 0.2.0 on HAL-17109. The one `minor` changeset that makes the Version packages
pull request say 0.2.0 can't land while the rule caps bumps at `patch`. A follow-up pull request sets
the cap back to `patch` once the release has merged.
