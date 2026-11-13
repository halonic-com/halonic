# oauth-sign-in.revoke-token

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, section 4)

The sign-in shall revoke a refresh token with one POST (RFC 7009) to the revoke endpoint it is given, with the token and the client's identity in the form body or header and never in the URL, refusing redirects, and shall say `revoked` only for an answer of 200 and `notConfirmed` otherwise, including when the server can't be reached.

## Examples

- Given a refresh token and a server that answers 200,
  then the result is `revoked`.
- Given a server that answers 503 or can't be reached,
  then the result is `notConfirmed`.
