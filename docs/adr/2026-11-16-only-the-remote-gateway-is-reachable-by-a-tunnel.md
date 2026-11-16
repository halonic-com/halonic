# Only the remote gateway is reachable by a tunnel

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

Studio on a phone should reach a runtime host on a desktop through a tunnel:
Tailscale first, then plain LAN, Cloudflare Tunnel and later a Halonic relay
(plan "phone reaches a runtime host through pluggable tunnels", approved by the
board on 11 Nov). The host already listens on loopback for several things that
must never leave the machine: the harness bridge (model requests and Halonic's
tools over MCP), the model gateway, MCP servers, and anything that reads
secrets. A tunnel that forwards a port forwards everything that port answers,
so the question is which listener a tunnel may ever point at, and what a phone
may say to it. We looked at forwarding the existing Studio server and at a
general remote API. Both would make every future endpoint remote by default.

## Decision

- **One target.** A tunnel reaches only the **remote gateway**, a separate
  listener in the desktop host. `TunnelConfig` names it by a literal loopback
  address and a port, and has no other field. The bridge, the model gateway, MCP
  servers and secrets stay loopback-only and never get a `TunnelConfig`.
- **A narrow protocol.** The gateway speaks the remote gateway protocol
  (`remote-gateway-protocol.ts` in `@halonicjs/ports`, version 1): sessions,
  their events, approvals and prompt input, nothing else. It has no message
  for a shell command, a file, a secret or a setting. Each message is at most
  64 KiB. A malformed, oversized or unknown message gets one `error` and the
  host closes the connection. A new message type is a new protocol version.
- **The tunnel carries bytes only.** `TunnelProvider` (port version 1) makes
  the gateway reachable and reports its state; it never sees what flows. The
  protocol always runs inside Halonic's own end-to-end session (pairing,
  phase B), even when the provider encrypts the path itself.
- **Same gates as local.** A remote prompt or approval goes through the same
  trust gate and sandbox as a local one. A risky approval (shell, file write,
  secret, leaving the sandbox) is refused with `not-allowed-remotely` unless
  the person allows it for that host, and needs a biometric unlock on the
  phone.
- **iOS designed in now.** Sessions are resumable: after a reconnect the phone
  watches each session again from the last event it saw. Transports are
  foreground-only: `pause` closes the connection and stops every timer, and
  `resume` connects at once. Endpoints use `https:`, `wss:` or `tcp:`, never
  plain `http:` or `ws:`, so iOS needs no exception.
- **One backoff.** A transport reconnects after 0.5 s, doubling to at most
  30 s, with ±20 % jitter (`tunnelReconnectDelayMs`), without a limit on tries
  while in the foreground. It never queues or resends a frame across a
  reconnect.

Nothing that lets a phone or another non-loopback client reach a host merges
before HAL-5199 is merged. The types in this record open nothing.

## Consequences

- A reviewer can check one rule: no code outside the remote gateway passes a
  port to a `TunnelProvider`, and the gateway imports nothing that reads
  secrets or calls the bridge.
- Phone features are limited to what the protocol lists. Adding one (say,
  reading a file) needs a protocol version and a decision on whether it is
  safe remotely, not just a new endpoint.
- The tunnel attack suite has a small surface to fuzz: one listener, five
  host messages, six phone messages and a size limit. It runs against a fake
  provider in CI, which phase A adds next to these types.
- Requirements `ports.tunnel-provider`, `ports.tunnel-resolver` and
  `ports.remote-gateway-protocol` hold the rules, and the type tests in
  `@halonicjs/ports` fail when a config can name another host, a status of
  `down` has no reason, or a phone message outside the list compiles.
