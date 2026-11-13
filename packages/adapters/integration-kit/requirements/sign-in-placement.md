# integration-kit.sign-in-placement

- Status: active
- Since: 0.2.0
- Source: HAL-8279 (pull request 2 of HAL-984, design section 3, 4 and 8: attack cases T2, T3 and T14)

The kit shall place the access token of a sign-in the permission sheet declares, for an integration that asks with `auth: { signIn, as }`, and only that way. It shall ask `SignInTokens.access` for the token on each hop that may carry it, put it in the header the sheet's `access` block says (`authorization: Bearer <value>`, or the header and prefix of the sheet), and never give the integration the value.

The placement goes through the same sheet check as a secret's: the same `as`, the same `header` ignoring ASCII case and the same `prefix` (a missing prefix and `""` count as the same), or the kit refuses with `placement-not-in-sheet` before any token is asked for and before anything is sent. A sign-in the sheet doesn't declare is refused with `sign-in-not-declared`. A `form` placement of a token is refused with `placement-not-in-sheet`: a token has no form placement.

The token shall go only to the hosts of the sign-in's `access` block, and only over `https`. A first host outside the list is refused with `token-not-allowed-for-host`, and plain `http`, even to this machine, with `token-over-plain-http`. After a redirect to a declared host the sign-in doesn't list, or to plain `http`, the kit leaves the token out of that hop and doesn't ask for it.

The client secret of a sign-in is only for Halonic's sign-in code. A placement of a secret that a sign-in names as its `clientSecret` shall be refused with `secret-sign-in-only`, before any secret is read; the code is one of the `leakAttemptCodes`.

When `SignInTokens.access` throws `SignInNeededError`, or the host has no `SignInTokens`, the kit shall refuse the request with `sign-in-needed` and send nothing. Any other failure of `access` ends the request as it is.

## Examples

- Given a sheet that puts the token of `example-account` as a bearer token on `api.example.com`,
  when the integration sends `auth: { signIn: "example-account", as: "bearer" }` to `api.example.com`,
  then the transport gets `authorization: Bearer <token>`, and the integration reads no token.
- Given a sheet that puts the token of `example-client-account` in `x-token` after `Token `,
  when the integration asks for it in `X-Token` with that prefix,
  then the kit places it.
- Given the same sheet,
  when the integration asks for another header, no prefix, a bearer token or a form field,
  then the kit throws `placement-not-in-sheet`, asks for no token and sends nothing.
- Given a sign-in the sheet doesn't declare,
  when the integration places it,
  then the kit throws `sign-in-not-declared`.
- Given a sign-in whose hosts are `api.example.com`,
  when the integration sends the request to `cdn.example.com`, which the sheet declares for other uses,
  then the kit throws `token-not-allowed-for-host` and asks for no token.
- Given a sign-in that lists `api.example.com` and a server there that redirects to `cdn.example.com`,
  when the integration sends the request,
  then the second hop carries no token and the kit asked for it once.
- Given a sign-in with a local plain `http` host,
  when the integration sends the token there,
  then the kit throws `token-over-plain-http`; and a redirect to it leaves the token out.
- Given the secret `account-client-secret`, named as a sign-in's client secret,
  when the integration places it,
  then the kit throws `secret-sign-in-only`, reads no secret and sends nothing.
- Given a sign-in that needs the user to sign in again,
  when the integration places its token,
  then the kit throws `sign-in-needed`, of the kind `unauthenticated`, and sends nothing.
- Given `SignInTokens.access` that fails with a network error,
  when the integration places the token,
  then the request fails with that error and not with `sign-in-needed`.
