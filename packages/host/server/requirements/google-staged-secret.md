# server.google-staged-secret

- Status: active
- Since: 0.1.0
- Source: HAL-710 (build plan B5, D6); google setup flow 4.3 (replacing a rotated secret)

The server shall keep a new client secret apart from the one in use, on `PUT /api/google/setups/<accountRef>/secret/staged`, under every rule of `server.google-secret` (sign-in, same site, JSON, secure connection, fixed answers). It shall refuse with 409 `secret_not_saved` a setup that has no secret, and with 409 `secret_needs_no_staging` a setup that has never signed in and whose client no other account uses, since `PUT …/secret` replaces the secret there. The secret in use shall not change. `POST …/secret/staged/check` shall test the staged secret with one refresh of the saved refresh token, using the account's own token or else the token of an account that signed in with the same client. When Google accepts the secret the server shall promote it and clear the `client` refusal of every account that uses the client. When Google refuses it the server shall discard it, and mark the accounts of the client as `client-gone` only when a `client` refusal was saved already. When the refresh token is refused the server shall save that refusal and keep the staged secret. Any other outcome shall change nothing. `DELETE …/secret/staged` shall drop the staged secret. The answers shall hold the outcome word and account refs, never a secret, token or text from Google. The request log shall leave out every path under `/api/google/setups/<accountRef>/secret`, the staged routes and the check included.

Rationale: a typo must never replace a working secret, and one accepted secret fixes every account on a shared client.

## Examples

- Given a signed-in setup, when a fake secret is staged and Google accepts it on the check, then the secret in use is the new one and nothing is staged.
- Given a signed-in setup, when Google refuses the staged secret, then the old secret is still in use, nothing is staged and no account is marked.
- Given a `client` refusal saved on the account, when Google refuses the staged secret too, then the account is marked `client-gone`.
