# Decision: the remote gateway runs while remote is on, in a host with a tunnel provider

- Approval: HAL-12243 (tunnel phase B build plan, decision 19, after the B7 sign-off on HAL-12242); Liam approves it in review
- Kind: internal

## What changes

Until now the remote gateway listened only when a test called `run` with a gateway setting, and
every host served remote as "not offered". B8 is the switch-on gate:

- `agent-host.remote-gateway`: the gateway's listener runs, on loopback only, while the host offers
  remote and remote is on, and stops when remote turns off or the host stops. A host offers remote
  only when the caller of `run` gives it a tunnel provider, and never over `--stdio`, without a
  profile folder, or without the profile's lock. The test-only gateway setting is gone; the gateway
  port is counted among the host's own only while it listens.
- `agent-host.remote-control`: turning remote on starts the gateway, then the tunnel pointed at its
  port; turning it off stops both. A gateway that can't start shows as the tunnel `down` with
  `provider-error`. The host stopping stops both and keeps the switches.
- `agent-host.remote-not-offered`: it now applies to a host with no provider (every launch of the
  executable), the cases above, and a profile whose remote files can't be read.

## Why

Decision 19 says the gateway may run once the attack suite passed (B7, signed off) and pairing
exists, and that `remote.available` becomes true. It also says the gateway stays reachable only
through a provider, which phase C brings. No provider exists in the executable yet. Reporting
`available: true` without one would show a Remote section whose tunnel can never come up (Studio
would word provider "none" as not installed, with a Tailscale link). So `available` is true exactly
when the host has a provider: tests and the attack suite now, the real providers in phase C. What
users see doesn't change, so the note is `internal`.

## Covers

- agent-host.remote-gateway
- agent-host.remote-control
- agent-host.remote-not-offered
