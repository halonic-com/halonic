# Decision: the Android release job passes secrets to the called Play workflow

- Task: HAL-16760 (board decision, 24 Nov 14:37 UTC: "go with (B), `secrets: inherit` on the `android` job")
- Approval: the board chose this fix on HAL-16760; Julian reviewed the pull requests on HAL-17598 and signs this note, because Liam wrote them
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:TWA6tPW+4tcTJbku4bDmS4tEvlFkaxA6jZfeu6gbtdgXxFnH4O15aOEVRumobbmSFIcxxvRmaHvLtJpSYvdKCA==

## What changes

In `.github/workflows/release.yml`, the `android` job, which calls `android-play.yml`, gets `secrets: inherit` with a short comment, a zizmor ignore for `secrets-inherit` and an `environment-secrets` allow comment. Nothing else changes: no permissions, no other job, no step in the called workflow.

The `environment-secrets` check (HAL-17794) fails a job that reads secrets without `environment:`. A job that calls a workflow with `uses:` can't set `environment:` (GitHub allows only a few keys there), so the allow comment, with its reason, is the only way through. The job that actually reads the secrets, `sign` in `android-play.yml`, runs in `release`.

## Why

On the `v0.1.1` tag run, the called workflow's "Sign with the upload key" step saw the `release` environment's upload keystore as empty, and the run stopped before the draft release and the npm stage. The board confirmed that the secrets exist in `release`. `sign-windows`, which is not a called workflow, read its `release` secret in the same run.

Inherit passes the repository's and organisation's secrets to `android-play.yml` too. There only the `sign` job reads secrets, and it runs in the `release` environment. `build`, `play-upload` and `play-apk` read none, and their third-party actions take no secret inputs, so they get nothing new. Naming the two secrets instead doesn't work: a caller job without an environment can't pass environment secrets by name.

GitHub's docs say a called job with `environment:` reads that environment's secrets by itself, so it isn't proven that the missing inherit was the cause. The next tag run is the real test. If it still sees an empty key, check the secret names and the tag rule in `release`.

## Covers

- .github/
