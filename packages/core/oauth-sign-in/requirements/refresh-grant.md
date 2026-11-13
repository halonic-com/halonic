# oauth-sign-in.refresh-grant

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, section 4)

The sign-in shall refresh an access token with one POST of `grant_type=refresh_token` to the token endpoint it is given, with the refresh token and the client's identity in the form body or header and never in the URL, refusing redirects and stopping when the caller's signal aborts, and shall give back what the answer means, or `unreachable` without anything the `HttpClient` reported.

## Examples

- Given a refresh token,
  then one POST goes to the endpoint with `grant_type=refresh_token` and the token in the body, and the URL holds neither it nor the secret.
- Given a client that can't be reached,
  then the result is `unreachable`.
