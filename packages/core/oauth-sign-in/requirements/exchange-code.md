# oauth-sign-in.exchange-code

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, section 4); the generic form of the request in `google-sign-in.exchange`

The sign-in shall send each token request as one POST to the endpoint its caller names, with the form (the code, the client ID and secret, the redirect URI and the PKCE verifier for a code exchange) in the body and never in the URL, refuse redirects, wait 10 seconds at most for the answer, read at most 64 KiB of it (an answer that declares or reaches more is refused before it is parsed, as if the provider couldn't be reached), and give back the status and the parsed body, or nothing when the provider couldn't be reached, without passing on the `HttpClient`'s error.

## Examples

- Given a code to exchange,
  then one POST goes to the token endpoint with `grant_type=authorization_code` and the form fields in the body, and the URL holds none of them.
- Given an answer that is an HTML page,
  then the status comes back with no parsed body.
- Given a client that throws an error holding the request,
  then the result is nothing, and the error is not passed on.
- Given a stalled provider,
  then the request is aborted after 10 seconds and the result is nothing.
- Given an answer of 64 KiB,
  then it is parsed; given one byte more, declared or streamed,
  then the result is nothing and the rest is never read.
