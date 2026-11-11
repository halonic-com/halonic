# Sandbox bridge on a socket: the bridge says its kind, loopback or socket

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

Each run's Halonic bridge listened on a free port of `127.0.0.1`. On Linux
that has two problems. Under srt-wsl the port sits in the network namespace
that every WSL 2 distro of the user shares, so the user's own Ubuntu can reach
it; the run token protects it, but the W9 rule (HAL-5407) allows no listening
port of ours. And under bubblewrap, srt gives the program its own network
namespace and `NO_PROXY=127.0.0.1`, so a loopback bridge is most likely not
reachable from inside the fence at all.

The program can't open a Unix socket itself on Linux: srt blocks every
`AF_UNIX` socket inside the fence, and the only switch that allows them also
turns off its seccomp filter. srt's own proxy, which runs outside the fence,
can send one host name to a Unix socket (`mitmProxy`). So the program calls a
name, and srt passes those requests to the run's socket (HAL-6316, approved on
HAL-6340; srt rule checked on HAL-6341).

## Decision

**`SandboxNetwork.bridge` is `SandboxBridge | null`, a union with an explicit
`kind`.** `{ kind: "loopback", host, port }` is the old address. `{ kind:
"socket", name, socketPath }` is a name the program calls on port 80, such as
`bridge.halonic.invalid`, that the sandbox's proxy sends to the Unix socket at
`socketPath`. An adapter reads the kind, never the shape, and rejects a kind
it can't serve when `open` is called.

**`HarnessBridge` gains an optional `socketPath`.** A socket bridge sets it
and makes `url` the name, such as `http://bridge.halonic.invalid`. A loopback
bridge leaves it out, as before. harness-kit turns a bridge into the
profile's `network.bridge`: a socket bridge by its path and the name in its
`url`, a loopback bridge by the host and port in its `url`.

**A bridge set up for sockets never falls back to a port.** If it can't create
its socket, the run fails.

**Version 7 of `Sandbox`.** A new value an adapter must handle, and a new
required `kind` on the old one, are breaking for adapters, so `sandboxVersion`
goes from 6 to 7. `HarnessBridgeServer` and `Harness` keep their versions: the
new field is optional, and every bridge open today is a loopback one.

## Consequences

- Every place that writes a loopback bridge adds `kind: "loopback"`. Adapters
  that can't serve a socket bridge yet (`sandbox-srt` until HAL-6348,
  `sandbox-host`) reject it in `open` with a clear message.
- `sandbox-srt` serves a socket bridge with `allowedDomains: [name:80]` and
  `mitmProxy: { socketPath, domains: [name] }` (HAL-6348). The fence tests
  check that the name reaches the socket and no other name or port does.
- `harness-bridge` gets a socket mode (HAL-6316): a fresh 0700 folder per run,
  a socket path checked against Linux's 107-byte limit, and the Host, Origin
  and token checks on every request, including the absolute form and inside a
  `CONNECT` tunnel that srt's proxy sends.
- The agent host turns the socket mode on for Linux, both native and srt-wsl.
  macOS and Windows keep the loopback port.
