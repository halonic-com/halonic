# Decision: MXC's fence proof and canary no longer listen on the computer's own addresses

- Approval: HAL-8306 (Liam, CTO)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:w5MUgwPWQ+3Y/pp+SM+EnibkvbOEg8Y0jBEwAuHZkgMdkhfssgY9neKqXvKeFGlFETINFo5o18uCocsZFhbYBQ==
- Task: HAL-8310

MXC's fence proof and canary listen only on loopback. The computer's other addresses are probed
without a listener.

## Covers

- `sandbox-mxc.session`
- `sandbox-mxc.canary`

## What changes

- `listenOnHostAddresses` and `listenOnEveryAddress` are gone. A listener on a non-loopback
  address brings up the Windows Firewall prompt (seen on windows-11-arm in HAL-8306); loopback
  doesn't.
- The probe program tries a TCP connection to ports 80 and 443 on each of the computer's own
  non-loopback addresses (link-local IPv6 left out), the same way as the local network probes
  (`lan-targets.ts`). A connection that connects is `port-reachable`. A refusal or a silence is
  read by the positive-control rules in `network-probes.ts`.

## Why

A fence proof that makes Windows ask the person about the firewall can't ship. Loopback keeps
its listeners, so the reach of a listener is still proven there.

## Known gaps

- Without a listener, "the fence refused" and "the closed port refused" look the same: both are
  a refusal. A box with no fence on these addresses and nothing listening reads as blocked.
  The follow-up is the MXC fence job (HAL-3655), which tells us the error code MXC returns inside
  the box, so the probe can tell the fence's refusal from a closed port's.
