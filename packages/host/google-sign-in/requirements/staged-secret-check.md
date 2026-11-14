# google-sign-in.staged-secret-check

- Status: active
- Since: 0.1.0
- Source: HAL-710 (build plan B5; design 4.3; plan D1)

When a client secret is staged for an account that has signed in, `checkStagedClientSecret` shall refuse with a `RangeError`, before reading or sending anything, a bad account ref or client ref, and shall send one refresh to Google's token endpoint with the account's saved refresh token, the client ID and the staged secret in the form body, redirects refused. It shall never read the secret in use. It shall return `accepted` when Google refreshes the token, saving a new refresh token if Google sent one; `refused` when Google answers `invalid_client`; `nothingStaged` or `notSignedIn` without sending anything; `unreachable` when Google can't be reached; and otherwise the refresh answer's kind from `readRefreshAnswer` (`signInRefused`, `googleError`, `unexpectedAnswer`), leaving the saved refresh token as it was. It shall keep the staged secret, the refresh token and the access token out of every result, every request URL and every `TokenStore` name, also when Google's answer or the `HttpClient`'s error echoes them.

Rationale: a typo in a pasted secret must not break a working connection, so the new secret is tested before it replaces the old one. A refused refresh is the only test Google gives, and it needs no service check.

## Examples

- Given a saved refresh token and Google refreshes it with the staged secret, then the result is `accepted` and the only request is the refresh.
- Given Google answers `invalid_client`, then the result is `refused` and the saved refresh token is unchanged.
- Given no secret is staged, then the result is `nothingStaged` and nothing goes to Google.
- Given Google answers `invalid_grant`, then the result is `signInRefused`: the staged secret wasn't tested.
- Given Google sends a new refresh token, then it replaces the saved one.
