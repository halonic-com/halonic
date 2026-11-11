# Decision: the sandbox profile's bridge says its kind, and the bridge may serve a Unix socket

- Approval: HAL-6340 (Liam approved the plan on HAL-6316, condition 6: an explicit `kind`)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:LSYk9jCHaoDE3AGanykNMBgmWLFFDfBZgfs2uj7+9mE/ROH298hG17FDofvO2J4++gWLP19EzHeEcDAnDLPQAw==

On Linux each run's bridge moves from a loopback port to a Unix socket that srt's proxy reaches
by a name (`bridge.halonic.invalid`), so no port of ours is open to the user's other WSL distros
(W9) and the program inside bubblewrap's empty network namespace can reach the bridge at all.
The ADR is `docs/adr/2026-11-11-sandbox-bridge-on-a-socket.md`.

Two requirements are extended, not weakened:

- `ports.sandbox-profile`: the bridge is a loopback address or a name served on a Unix socket,
  and says which with `kind`. A loopback bridge whose host isn't a loopback address is still
  rejected; a kind the adapter can't serve is rejected too. Two examples are added (a bridge
  without its kind doesn't compile; a socket bridge compiles).
- `ports.harness-bridge-server`: the bridge listens on a loopback port or on a Unix socket of its
  own, gives the socket's path, and never falls back from a socket to a port. The first example
  no longer says "loopback" `url`, and one example is added (a socket bridge gives its path, a
  loopback one doesn't).

No test was removed or weakened; every existing bridge in a test gains `kind: "loopback"`.

## Covers

- ports.sandbox-profile
- ports.harness-bridge-server
