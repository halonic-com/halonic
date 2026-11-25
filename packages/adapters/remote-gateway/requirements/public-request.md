# remote-gateway.public-request

- Status: active
- Since: unreleased
- Source: task HAL-17605 (phase 2 G0), from the security review of the Tailscale tunnel provider: Funnel turned on for the gateway's port after the tunnel came up would make the gateway public

When the remote gateway's listener is given header names that a tunnel adds only to a request from the public internet (`publicHeaders`, compared in lower case), it shall refuse a request that carries any of them with 403 and an empty body, before it looks at the request's `Origin` or path, so a tunnel that someone makes public after it came up still can't reach the gateway. Without such names it shall accept requests as `remote-gateway.listener` says.

## Examples

- Given a listener told that `Tailscale-Funnel-Request` marks a public request,
  when a handshake that names a listed tunnel name carries `Tailscale-Funnel-Request: ?1`,
  then the answer is 403.
- Given the same listener,
  when the same handshake comes without that header,
  then the answer is 101.
- Given a listener told no such names,
  when a handshake carries `Tailscale-Funnel-Request: ?1`,
  then the answer is 101.
