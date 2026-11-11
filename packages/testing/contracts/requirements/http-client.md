# contracts.http-client

- Status: active
- Since: 0.1.0
- Source: `HttpClient` port v1; code review of 11 Nov (HAL-5219)

Where an adapter implements `HttpClient`, it shall pass `init.redirect` and `init.signal` through to the request: a redirect it was told to refuse throws, or is returned as it is, and is never followed, and a request whose signal aborts, before or during the request, throws.

## Examples

- Given a peer that redirects to a second URL,
  when the adapter fetches it with `redirect: "error"`,
  then it throws and the second URL got no request.
- Given the same peer,
  when the adapter fetches it with `redirect: "manual"`,
  then the second URL got no request.
- Given an adapter that follows redirects whatever `redirect` says,
  when the suite runs,
  then it fails and names the case.
- Given a request that waits for a slow answer,
  when its signal aborts,
  then the request throws and doesn't wait for the answer.
