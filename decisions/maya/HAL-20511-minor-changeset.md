# Decision: the changesets rule allows a minor bump for the 0.2.0 release

- Approval: the Paperclip task HAL-20511, where Liam decided to raise the cap in this pull request; the board approved 0.2.0 on HAL-17109
- Kind: internal

`maxBump` in `tooling/check/src/rules/changesets.ts` goes from `patch` to `minor`, and `check.changesets-patch-only` and its tests follow, because the board approved 0.2.0 on HAL-17109 and its one `minor` changeset can't land under a `patch` cap. A follow-up sets it back to `patch` after the release merges.

## Covers

- check.changesets-patch-only
- tooling/check/
