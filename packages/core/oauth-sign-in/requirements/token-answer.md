# oauth-sign-in.token-answer

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, section 4); the generic form of `google-setup.sign-in-token-answer`

The sign-in shall classify the provider's answer to the code exchange as `wrongClientSecret` for `invalid_client`, `codeRefused` for `invalid_grant`, `providerError` with the status for any other error, `unexpectedAnswer` for a body that isn't a JSON object, and otherwise `tokens` with the refresh token, the ID token and the granted scopes the answer has (each optional), never the access token, and shall never read `error_description` nor keep an `error` value that isn't a plain snake_case code.

## Examples

- Given status 401 and `{"error":"invalid_client"}`,
  then the answer means `wrongClientSecret`.
- Given an HTML error page,
  then the answer means `unexpectedAnswer` with its status.
- Given a success with only an access token,
  then the answer means `tokens` with no refresh token, ID token or scopes.
- Given an `error` of `code=abc` with an `error_description` that echoes a secret,
  then the result holds neither.
