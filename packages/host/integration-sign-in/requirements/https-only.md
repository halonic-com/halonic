# integration-sign-in.https-only

- Status: active
- Since: 0.1.0
- Source: HAL-8650 (HAL-984 design, section 4)

The host shall give the sign-in an `HttpClient` that sends a request only to an `https` address and refuses any other URL, plain `http` and an unparseable URL included, with an error before the wrapped client is called, because a token request carries the code, the client secret and the refresh token.

## Examples

- Given `https://auth.example.com/token`,
  then the wrapped client gets the request.
- Given `http://auth.example.com/token` or `http://127.0.0.1:8787/token`,
  then the request is refused and the wrapped client is never called.
