# google-sign-in.no-secret-leak

- Status: active
- Since: 0.1.0
- Source: HAL-699 (plan D6, section 4; HAL-718)

The sign-in shall keep the client secret, the code, the PKCE verifier, the access token, the refresh token and the ID token out of every result it returns, the auth URL, every request URL and every `TokenStore` name, also when Google's answer echoes them or the `HttpClient` fails with them in its error, and shall write nothing to the `TokenStore` but the refresh token.

## Examples

- Given an error answer whose `error_description` holds the code and the client secret,
  then the result holds neither.
- Given a network failure whose error message holds the client secret,
  then the result is `unreachable` and holds nothing of the error.
- Given a sign-in that succeeds,
  then the only name written to the `TokenStore` is the refresh token's.
