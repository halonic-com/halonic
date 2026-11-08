# google-setup.sign-in-token-answer

- Status: active
- Since: 0.1.0
- Source: HAL-699 (design 3.5, plan section 3)

The sign-in shall classify Google's answer to the code exchange as `wrongClientSecret` for `invalid_client`, `codeRefused` for `invalid_grant`, `googleError` with the status for any other error, `unexpectedAnswer` for a body that isn't a JSON object or a success without an ID token or scope, `noRefreshToken` for a success without a refresh token, and otherwise `tokens` with the refresh token, the ID token and the scopes Google granted, never the access token.

## Examples

- Given status 401 and `{"error":"invalid_client"}`,
  then the answer means `wrongClientSecret`.
- Given an HTML error page,
  then the answer means `unexpectedAnswer` with its status.
- Given a success whose `scope` lacks a scope that was asked for,
  then `grantedScopes` lacks it too.
