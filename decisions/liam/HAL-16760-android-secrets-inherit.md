# Decision: the Android release job passes secrets to the called Play workflow

- Task: HAL-16760 (board decision, 24 Nov 14:37 UTC: "go with (B), `secrets: inherit` on the `android` job")
- Approval: the board chose this fix on HAL-16760; Julian reviewed the pull requests on HAL-17598 and signs this note, because Liam wrote them
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:bWK07+uViwSlA8jb5FKvpktU7opW7JiBvhGf58ixPN72VVp/xQ4g8IsnbZU+Ws9fxGi/9nl1c2vWAvuEPIYOBA==

## What changes

In `.github/workflows/release.yml`, the `android` job, which calls `android-play.yml`, gets `secrets: inherit` with a short comment and a zizmor ignore for `secrets-inherit`. Nothing else changes: no permissions, no other job, no step in the called workflow.

## Why

On the `v0.1.1` tag run, the called workflow's "Sign with the upload key" step saw the `release` environment's upload keystore as empty, and the run stopped before the draft release and the npm stage. The board confirmed that the secrets exist in `release`. `sign-windows`, which is not a called workflow, read its `release` secret in the same run.

Inherit passes the repository's and organisation's secrets to `android-play.yml` too. There only the `sign` job reads secrets, and it runs in the `release` environment. `build`, `play-upload` and `play-apk` read none, and their third-party actions take no secret inputs, so they get nothing new. Naming the two secrets instead doesn't work: a caller job without an environment can't pass environment secrets by name.

GitHub's docs say a called job with `environment:` reads that environment's secrets by itself, so it isn't proven that the missing inherit was the cause. The next tag run is the real test. If it still sees an empty key, check the secret names and the tag rule in `release`.

## Covers

- .github/
