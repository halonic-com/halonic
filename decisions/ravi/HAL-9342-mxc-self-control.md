# Decision: a box with no bridge proves its network control by talking to itself

- Approval: Liam signs this note in review of the pull request
- Kind: internal
- Signature: UNSIGNED
- Task: HAL-9342 (ruling), HAL-9335

## What changes

- `sandbox-mxc` fence proof: when the profile has no bridge, the probe program opens a TCP listener
  and a UDP socket on the box's own `127.0.0.1`, connects to the listener and sends itself one
  datagram. Both must work. That is the network control: a timeout to the outside then means the
  policy dropped it. Profiles with a bridge keep the bridge as the control.
- `sandbox-mxc.session` has the new wording and examples (self-control works: `fenced`; fails:
  `not-fenced`).
- `integration-runner.mxc-profile` and the HAL-9155 ruling stay as they are: no bridge, no
  loopback rule, no DNS. The sockets live inside the probe's process and close before the
  caller's programs start.

## Why

The runner's no-bridge profile could never get a `fenced` proof, so `mxcFencesRunner` could not be
flipped. A dead-end bridge was rejected (it brings back the name-lookup leak), and so was dropping
the control (a broken Winsock would look like a working fence). Fallback if MXC blocks the
self-connection on `windows-11-arm`: a control box (option 2 of HAL-9342).

## Covers

- sandbox-mxc.session
