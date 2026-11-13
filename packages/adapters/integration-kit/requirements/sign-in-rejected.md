# integration-kit.sign-in-rejected

- Status: active
- Since: 0.2.0
- Source: HAL-8279 (pull request 2 of HAL-984, design section 4, "When the server says no", and attack cases T13 and T15)

The kit shall return a 401 to the integration unchanged and shall not resend the request, because a write might not be safe to send twice. When a hop's answer is a 401, the kit shall call `SignInTokens.rejected` with the sign-in and the value for each token it placed on that exact hop, and for no other: a token left out of the hop, a secret, or a 401 from a hop that placed nothing says nothing about a token. Whether the value is still the current token, and when a refresh is forced, is for `SignInTokens` (it counts only the current token, at most one forced refresh per sign-in per 30 seconds, none for a freshly refreshed token). Any other status leaves `rejected` uncalled.

## Examples

- Given a request that places the token of `example-account`,
  when the server answers 401,
  then the integration gets the 401 as it is, the transport saw one request, and `rejected` was called once with the sign-in and the value placed.
- Given a request that places a token and a server that answers 200, 403 or 500,
  when the answer arrives,
  then `rejected` is not called.
- Given a request to `api.example.com` that redirects to `cdn.example.com`, where the sign-in's token isn't placed,
  when the second hop answers 401,
  then `rejected` is not called.
- Given a request that places only a secret,
  when the server answers 401,
  then `rejected` is not called.
- Given a refresh that issues a new token between two requests,
  when the second request gets a 401,
  then `rejected` names the value that request placed, not the older one.
