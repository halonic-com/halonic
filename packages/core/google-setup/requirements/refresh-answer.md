# google-setup.refresh-answer

- Status: active
- Since: 0.1.0
- Source: HAL-709 (build plan B4; design 5.2)

The refresh shall read Google's answer to a token refresh as `signInRefused` for `invalid_grant`, `clientRefused` for `invalid_client`, `googleError` with the status for any other error, `unexpectedAnswer` for a body that isn't a JSON object or a success without an access token or a positive `expires_in`, and otherwise `refreshed` with the access token, `expires_in`, and the new refresh token and granted scopes when Google sent them. It shall never read `error_description`, so no meaning other than `refreshed` holds a token, the client secret or Google's free text.

## Examples

- Given status 400 and `{"error":"invalid_grant"}`,
  then the answer means `signInRefused`.
- Given status 401 and `{"error":"invalid_client","error_description":"<the client secret>"}`,
  then the answer means `clientRefused`, and the secret appears nowhere in it.
- Given a success with a `scope` smaller than at sign-in,
  then `grantedScopes` is the smaller list.
