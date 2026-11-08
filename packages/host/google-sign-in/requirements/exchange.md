# google-sign-in.exchange

- Status: active
- Since: 0.1.0
- Source: HAL-699 (design 3.5, plan section 3; HAL-718)

When a callback brings a code for a pending sign-in, the sign-in shall send one POST to Google's token endpoint with the code, the client ID and secret of the client that started it, the redirect URI and the PKCE verifier in the form body, and shall save the refresh token under `refreshTokenName(accountRef)` only after the ID token passes, replacing any earlier one without revoking it; it shall return `signedIn` with the e-mail Google confirmed, the scopes Google granted and the services' scopes it didn't grant, and otherwise one of `wrongClientSecret`, `codeRefused`, `noRefreshToken`, `googleError`, `unexpectedAnswer`, `unreachable`, `noClientSecret` or `idTokenRefused`.

## Examples

- Given Google answers with tokens,
  then the refresh token is saved and the result is `signedIn`; the access token is dropped.
- Given Google answers `invalid_client`,
  then the result is `wrongClientSecret` and nothing is saved.
- Given the same callback twice at once,
  then the code is sent to Google once.
