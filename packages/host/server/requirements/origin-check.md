# server.origin-check

- Status: active
- Since: 0.1.0
- Source: HAL-9 plan phase 4; HAL-6 finding 1; build plan on HAL-195 (PR 2)

The server shall refuse a request that has an `Origin` header unless that header equals the server's own origin exactly (the request's scheme, then `//`, then its `Host`), with status 403 and the code `origin_not_allowed`. `Origin: null` shall be refused. A request with no `Origin` header shall go on.

Rationale: a browser sends `Origin` on every request a web page makes to another address and on every same-origin write, so a request that names any other origin comes from another page. Programs such as the Android app send none.

## Examples

- Given a request to `https://halonic.acme.example` with `Origin: https://evil.example`, then the answer is 403.
- Given the same request with `Origin: https://halonic.acme.example`, or with no `Origin`, then it goes on.
- Given `Origin: null`, `Origin: http://halonic.acme.example` (other scheme) or `Origin: https://halonic.acme.example:8443` (other port), then the answer is 403.
