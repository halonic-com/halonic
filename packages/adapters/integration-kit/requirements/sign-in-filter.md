# integration-kit.sign-in-filter

- Status: active
- Since: 0.2.0
- Source: HAL-8279 (pull request 2 of HAL-984, design section 5, and attack cases T4 and T5)

The kit shall treat every value `SignInTokens.filterValues` lists, which are the access tokens not yet expired, the refresh token and the client secret, like a secret's value: it removes every form the filter knows (raw, URL-encoded, form-encoded, JSON-escaped) from the responses it hands back, from its refusals and errors, and from the headers and URL, and it refuses a request whose own method, URL, headers or body carries one with `secret-in-request`, to any host. A token the kit placed is also removed in its placed form (`Bearer <value>`, or the header's prefix and the value). The values are read for each request, and again for each hop that places a token, so a token a refresh issued during the request is removed too.

## Examples

- Given a server that echoes the placed token in a header, a text body or a JSON body,
  when the integration reads the answer,
  then each copy is `[secret removed]`.
- Given the older access token, the refresh token or the client secret, which this request doesn't place,
  when a server echoes one back,
  then it is removed too.
- Given a token the integration got from an echo in a form the filter missed,
  when it puts the value in its own query, header or body, for any declared host,
  then the kit throws `secret-in-request` and the transport sees nothing.
- Given a token that a refresh issues while the request is in flight, and a server that echoes it,
  when the integration reads the answer,
  then the token is removed.
- Given a redirect whose `Location` holds a listed value,
  when the kit gets it,
  then it throws `secret-in-redirect` and follows nothing.
