# Decision: local tools run on MXC only when they have no network

- Approval: Liam approves this note in review on HAL-9171
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XZXDEk6NHRuo73U7C1kq0mOiahVGoPLcrnxN5XaLi7ent1wOtZjTzvyIUMl0svOggqQfevuChca5XSfIG4//Cg==
- Task: HAL-3403

## What changes

- `app.plugin-local-tools` now says that, where MXC is in use and counts as a fence
  (`mxcFencesRunner`, which stays `false`), a local tool opens its session in MXC only when its
  profile allows no site and has no bridge. Any site or any bridge fails the call with
  `network-needs-srt`, before MXC's `open`, with nothing started.
- While the switch is `false` or MXC isn't in use, the host's own sandbox decides as before.

## Why

MXC's SDK v1 has no rule per host name, so it cannot allow single sites. A bridge is a network
too: it is a port the box could reach. Refusing both before `open` gives a code the app can word,
instead of an error from MXC that no one could.

## Covers

- app.plugin-local-tools
