# sign-in.echo-attacks

- Status: active
- Since: 0.1.0
- Source: HAL-8618 (HAL-984 design, section 8: attack cases T4 and T5)

The kit shall remove from every answer each value the sign-in tokens list, as it is, URL-encoded and JSON-escaped, wherever the server puts it, and shall refuse as `secret-in-request` a request of the integration's own that carries any of them, without sending it.

## Examples

- Given a server that echoes the access token in a header, a text body, a JSON body, a URL-encoded body, a `Location` header or a JSON-escaped copy, for a token with characters that need escaping,
  then every copy reads `[secret removed]`.
- Given an echo split across the pieces of a streamed body, or sent by a host the request was redirected to,
  then the token is removed.
- Given an older access token that still works, the refresh token and the client secret,
  then each is removed, though no request placed it.
- Given a token a refresh issued after the request started,
  then it is removed from a later hop's answer.
- Given the current or an older access token, the refresh token or the client secret in the integration's own query, header, text body or JSON body, plain or URL-encoded,
  then the kit refuses the request and sends nothing.
- Given an integration that writes the token into `authorization` itself,
  then the kit refuses the request; and the kit still places its own token on the same request.
