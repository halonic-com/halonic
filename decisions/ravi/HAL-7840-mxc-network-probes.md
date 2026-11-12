# Decision: MXC's fence proof and canary probe the internet, DNS and the host's other addresses

- Approval: HAL-7840 (Liam, CTO, asked for it in the review of the session pull request)
- Kind: internal
- Task: HAL-7840
- Covers: `sandbox-mxc.session`, `sandbox-mxc.canary`

## What changes

- The probe program also tries a TCP connection to two public addresses (IPv4 and IPv6), a DNS
  query sent straight to two public DNS servers, and a connection to each other address of this
  computer. The fence proof and the canary read the results: `internet-reachable`,
  `dns-reachable` and `port-reachable`.
- **A positive network control.** The probe also connects to the bridge, which the box is
  allowed to reach. A result counts as blocked only when the system refused it (`ECONNREFUSED`,
  `EACCES`, `EPERM`, no route), or when it timed out and the bridge connected. Any other error,
  such as Winsock failing to start without `SystemRoot`, proves nothing: the fence is
  `not-fenced`, and in the canary `networkBlockProven` is `false`, so the trust check fails as
  `too-strict`.
- `core/app`'s `CanaryFindings.controls` gains `networkBlockProven`.

## Why

A box that can't use the network at all would pass a probe that counts every error as
"blocked", while a child program that sets `SystemRoot` itself could connect.

## Known gaps

- The default gateway and other private addresses, and the bridge's own leaks (`CONNECT`, a
  request for another host or port), aren't probed yet. MXC isn't offered to users before they
  are.
