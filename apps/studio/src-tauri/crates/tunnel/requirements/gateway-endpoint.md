# studio.src-tauri.crates.tunnel.gateway-endpoint

- Status: draft
- Since: unreleased
- Source: HAL-12244; the `TunnelEndpoint` and QR payload rules in `@halonicjs/ports` (tunnel phases A and B)

The phone shall read an endpoint only when its scheme is `wss:`, `https:` or `tcp:`, followed by an optional `//`, a host name or an IP address (IPv6 in brackets), a port from 1 to 65535 (443 when a TLS endpoint names none) and at most a trailing `/`. A `tcp:` endpoint shall name its port. It shall connect a WebSocket to `/v1/gateway` there, over TLS for `wss:` and `https:` and over plain TCP for `tcp:`.

## Examples

- Given `tcp:192.168.1.20:4100`,
  when it is read,
  then the phone connects to `ws://192.168.1.20:4100/v1/gateway` without TLS.
- Given `https://host.example.ts.net/`,
  when it is read,
  then the phone connects over TLS to port 443.
- Given `ws:`, `http:`, a path, a query, user info, port 0 or a `tcp:` endpoint without a port,
  when it is read,
  then it is refused.
