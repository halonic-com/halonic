# server.response-headers

- Status: active
- Since: 0.1.0
- Source: HAL-9 plan phase 4; build plan on HAL-195 (PR 2)

The server shall put on every response it sends, including every refusal, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin` and `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`. A response to a request made over `https` shall also carry `Strict-Transport-Security`.

Rationale: the headers stop a browser from sniffing, framing, caching or leaking a reply. The route that serves the Studio page loosens the content security policy for its own files only, with its own requirement (`server.studio-page`).

## Examples

- Given a refused request, when the response is read, then it has all six headers.
- Given a request over `https`, then the response has `Strict-Transport-Security`; given one over `http`, it does not.
