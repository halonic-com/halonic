# server.host-check

- Status: active
- Since: 0.1.0
- Source: HAL-9 plan phase 4 (loopback-only `Host` without a password); HAL-6 findings 1 and 5; build plan on HAL-195 (PR 2)

The server shall answer a request only when its `Host` header is a plain host name or address with an optional port, and refuse any other with status 421 and the code `host_not_allowed` before it looks at the path or the body. A loopback name (`localhost`, `127.0.0.1`, `[::1]`) shall be accepted on any port. Any other name shall be accepted only when a password is configured and the name, lowercased, is in `allowedHosts`. A server with no password shall accept loopback names only, whatever `allowedHosts` holds.

Rationale: a web page can make a browser send requests to `localhost` (DNS rebinding). The browser can't change the `Host` the page's name resolves to, so refusing every name the server doesn't expect closes that route, and a server with no password has nothing else protecting it.

## Examples

- Given a server with no password and `allowedHosts` of `["evil.example"]`, when a request has `Host: evil.example`, then the answer is 421.
- Given a server with a password, when a request has `Host: localhost:4173`, then it goes on.
- Given a server with a password, when a request has no `Host`, or `Host: a@halonic.acme.example`, then the answer is 421.
