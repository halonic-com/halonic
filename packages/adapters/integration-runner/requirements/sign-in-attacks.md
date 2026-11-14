# integration-runner.sign-in-attacks

- Status: active
- Since: 0.1.0
- Source: HAL-8618 (HAL-984 design, section 8: attack cases T2, T3, T4, T5 and T14)

The bridge shall show the runner nothing of a sign-in's tokens: it shall remove the access token, the refresh token and the client secret from every head, body piece and error it sends, it shall refuse a request of the runner's that carries any of them as `secret-in-request` and record a leak attempt, and it shall refuse a client secret or a token placed other than the sheet says as a leak attempt, before anything is sent.

## Examples

- Given a runner that asks a server to echo the access token, in a header and in a body split in two,
  then the head, the pieces and the answer's text show `[secret removed]` and never the token.
- Given a server that fails with an error that holds the token,
  then the runner's error and the log hold none.
- Given a runner that puts the access token, the refresh token or the client secret, or an older access token that still works, in a URL,
  then the request is answered `secret-in-request`, a leak attempt is recorded for each, and nothing reaches the provider.
- Given a runner that asks for the token on a declared host the sign-in doesn't list,
  then the answer is `token-not-allowed-for-host` and no leak attempt is recorded.
- Given a runner that places the client secret, or the token in a header or prefix the sheet doesn't say,
  then the request is refused with `secret-sign-in-only` or `placement-not-in-sheet`, one leak attempt is recorded, and the runner goes on.
