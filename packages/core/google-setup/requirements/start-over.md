# google-setup.start-over

- Status: active
- Since: 0.1.0
- Source: HAL-706 (build plan B1, D1; design 3.6; security review A7 in HAL-705)

When a setup is started over, `startOver` shall remove the account's refresh token and its setup record, and compact `_google_setups` so the record's old values leave the record store. It shall remove the client secret and any staged secret unless another account's record uses the same client ref, and return `removed`, `kept-for-other-accounts`, `none-saved` when the setup had no secret, or `unknown` when the record was damaged, in which case it removes the record and the refresh token but no client secret. It shall remove the secrets before the record, and never talk to Google.

## Examples

- Given a setup with a saved and a staged secret and a refresh token, used by no other account,
  when it is started over, then it returns `removed`, the token store holds none of them, and `_google_setups` holds no change for the account.
- Given two accounts that share a client,
  when one is started over, then it returns `kept-for-other-accounts`, the other account still reads the secret, and its record is unchanged.
- Given a setup that stopped before step 6, then it returns `none-saved`.
- Given a damaged record, then it returns `unknown`, the record is gone and the client secrets stay.
- Given an account ref with no record, then it returns `none-saved` and nothing else changes.
