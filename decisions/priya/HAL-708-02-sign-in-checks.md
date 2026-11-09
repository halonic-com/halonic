# Decision: `google-sign-in.exchange` saves only for the connector's account and returns per-service checks

- Requirement: `google-sign-in.exchange` (`packages/host/google-sign-in/requirements/exchange.md`)
- Task: HAL-708 (build plan B3), plan approved by the maintainer in HAL-1056
- Approval: the maintainer approved the change in HAL-1056 and approves this note in review

## What changes

1. **The refresh token is saved later.** Before, it was saved as soon as the ID token passed. Now
   the ID token's verified e-mail must also be the connector's address; for another account the
   result is the new `wrongAccount` and nothing is saved (`google-sign-in.account-check`).
2. **`signedIn` returns per-service checks.** `grantedScopes` and `missingScopes` are replaced by
   `services`: one result per ticked service, from its scopes and its `googleCheck`, which runs with
   the fresh access token before the result goes back (`google-sign-in.service-checks`). Nothing
   consumed the two old fields yet (the routes, B5, aren't built).
3. **A success without an access token is `unexpectedAnswer`.** The checks need it. Google always
   sends one, so this only changes what a broken answer gives.
4. **The start input** takes `account` (required, the login hint too) and `services` instead of
   `scopes` and the optional `loginHint`, so the scopes asked for and the services checked can't
   disagree.

## Why

The design says nothing is saved for the wrong account (3.5 point 3, item 6), and the old order
saved the refresh token before anyone could compare the e-mail. The "is the API on?" check needs the
access token, which must never leave `finishGoogleSignIn` (plan D6), so the check runs there.

## Tests

The "lists the scopes the user unticked" test is replaced by the per-service test in
`src/checks-after-sign-in.test.ts` ("doesn't check a service whose scopes the user unticked"). The
tests that counted requests now count token requests or list the check after it. No case was
dropped.
