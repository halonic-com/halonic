# oauth-sign-in.refresh-answer

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, section 4)

The sign-in shall read the answer to a refresh as `grantRefused` for `invalid_grant`, `clientRefused` for `invalid_client`, `providerError` with the code and status for any other error, `unexpectedAnswer` for a body that isn't a JSON object or a success whose `token_type` isn't `bearer` (any case) or whose access token or carried refresh token isn't usable, and otherwise as `refreshed` with the access token and, when present, a positive `expires_in`, a rotated refresh token and the granted scopes; it shall never read `error_description`.

## Examples

- Given `invalid_grant`,
  then the answer means the user signs in again.
- Given a success with `token_type: mac` or a one-character access token,
  then the answer is `unexpectedAnswer` and nothing is kept.
- Given a success without `expires_in`,
  then it is `refreshed` with no lifetime.
