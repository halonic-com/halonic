# google-sign-in.exchange

- Status: active
- Since: 0.1.0
- Source: HAL-699 (design 3.5, plan section 3; HAL-718); changed by HAL-708 (decision `decisions/priya/HAL-708-02-sign-in-checks.md`)

When a callback brings a code for a pending sign-in, the sign-in shall send one POST to Google's token endpoint, refusing redirects and waiting 10 seconds at most for the answer (a stall is `unreachable`), with the code, the client ID and secret of the client that started it, the redirect URI and the PKCE verifier in the form body, and shall save the refresh token under `refreshTokenName(accountRef)` only after the ID token passes and its e-mail is the connector's (`google-sign-in.account-check`), replacing any earlier one without revoking it; it shall return `signedIn` with the e-mail Google confirmed and one check result per ticked service (`google-sign-in.service-checks`), and otherwise one of `wrongAccount`, `wrongClientSecret`, `codeRefused`, `noRefreshToken`, `googleError`, `unexpectedAnswer` (also for a success without an access token), `unreachable`, `noClientSecret` or `idTokenRefused`.

## Examples

- Given Google answers with tokens,
  then the refresh token is saved, each service is checked and the result is `signedIn`; the access token is then dropped.
- Given Google answers `invalid_client`,
  then the result is `wrongClientSecret` and nothing is saved.
- Given Google doesn't answer within 10 seconds,
  then the result is `unreachable`.
- Given the same callback twice at once,
  then the code is sent to Google once.
