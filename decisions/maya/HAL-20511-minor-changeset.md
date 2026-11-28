# Decision: the changesets rule allows a minor bump for the 0.2.0 release

- Approval: the Paperclip task HAL-20511, where Liam decided to raise the cap in this pull request; the board approved 0.2.0 on HAL-17109
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:L8VocEuqH1yHd3cihzD+KSrCeOd2lTSCuIfVBdp4Dfxej0yDCVGsKTMpK5+IAdP+O1yPZz0uzaoXHrE3FuDTCQ==

`maxBump` in `tooling/check/src/rules/changesets.ts` goes from `patch` to `minor`, and `check.changesets-patch-only` and its tests follow, because the board approved 0.2.0 on HAL-17109 and its one `minor` changeset can't land under a `patch` cap. A follow-up sets it back to `patch` after the release merges.

## Covers

- check.changesets-patch-only
- tooling/check/
