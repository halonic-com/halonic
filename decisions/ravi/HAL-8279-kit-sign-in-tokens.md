# Decision: the kit places sign-in tokens, and three requirements change for it

- Approval: design HAL-984 v0.4, sections 3, 4 and 5 and decisions 3, 5 and 6, approved by Liam on HAL-1080 and Julian on HAL-1081; built in HAL-8279 (pull request 2 of HAL-984)
- Kind: internal
- Signature: pending

## What changes

The kit now places the access token of a sign-in the permission sheet declares, returns a 401 unchanged and tells Halonic's side which token it placed, and filters the values of a sign-in's tokens like a secret's. Three active requirements change for it:

- `integration-kit.placement-from-sheet`: the rule that refused any placement with a `signIn` key (`sign-in-not-placed-yet`, from pull request 1) goes, because the kit places a token now. A placement that names both a `secret` and a `signIn` is still refused, as `placement-not-in-sheet`, so a `signIn` key can't carry a secret past the secret check. Its example is replaced by that case; the test that stood for it is rewritten and keeps its number of checks. The code `sign-in-not-placed-yet` is removed.
- `integration-kit.leak-attempt-codes`: `leakAttemptCodes` gains `secret-sign-in-only`, the refusal for an integration that tries to place a sign-in's client secret. A legitimate integration never does this, and the client secret is the one value that must reach only Halonic's token and revoke calls, so the connector is paused like it is for `placement-not-in-sheet`. Its test lists the new code and one more refusal.
- `ports.integration-sign-in-placement`: the sentence about the kit refusing `signIn` placements until a later change goes. `SignInTokens.access` throws a new `SignInNeededError` when the user has to sign in again, with one more example and test.

The new requirements are `integration-kit.sign-in-placement`, `integration-kit.sign-in-rejected` and `integration-kit.sign-in-filter`; they add tests only.

## Why

Pull request 1 gave the sheet and the port their shape and kept the kit from placing a token. Without this change a sign-in in a sheet can never be used.

## Covers

- integration-kit.placement-from-sheet
- integration-kit.leak-attempt-codes
- ports.integration-sign-in-placement
