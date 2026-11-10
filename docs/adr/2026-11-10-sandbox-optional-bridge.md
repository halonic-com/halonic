# Sandbox optional bridge: a profile can say it has no bridge

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

Every `SandboxProfile` had to name the Halonic bridge, the one loopback
address a program in the sandbox may reach. For an agent harness that is
right: its model calls and Halonic tools go through the bridge. The fenced
runner for local integrations (HAL-958 design, HAL-983) is different. It
talks to Halonic only over its standard input and output, and the kit makes
every web request on Halonic's side. The design gives it no network at all.
With a required bridge, the runner would still get one open loopback port it
never uses, and that port is one more way out of the fence. We looked at
pointing the bridge at a closed port (it is still allowed, and something
could listen there later) and at an optional field (an absent field would
read as "no restriction", which the port has ruled out since 0.1).

## Decision

**`SandboxNetwork.bridge` is `{ host, port } | null`.** `null` means no
bridge: the program reaches no loopback address, only the profile's
`allowedSites`. With no sites either, it reaches no network. The field stays
required, so leaving it out still doesn't compile.

**The default is unchanged.** Every existing caller passes a bridge and gets
the same fence as before. Only a caller that writes `null` gets the closed
network.

**In `sandbox-srt`,** `null` leaves the bridge out of srt's
`allowedDomains`. srt reads an empty list as "no network" and still sends
every connection through its proxy, so loopback, the proxy and allowed sites
that resolve to loopback are all refused. `open` checks the loopback rule
only when there is a bridge.

**Version 4.** A value the adapter must handle is breaking for adapters under
the port freeze ([port list and versions](2026-11-07-port-list-and-versions.md)),
so `sandboxVersion` goes from 3 to 4. For callers it is additive.

## Consequences

- The integration runner can open a session with `bridge: null` and no
  sites, so the fence is its only network rule, with nothing to reach.
- Every adapter handles `null`. `sandbox-srt` does in this change; the memory
  fake and `sandbox-host` never read the bridge.
- `ports.sandbox-profile` and `sandbox-srt.profile-to-srt-config` gain a
  no-bridge example. The real-fence tests check that a session without a
  bridge reaches no loopback port, directly or through srt's proxy, on
  bubblewrap and Seatbelt (`fence/srt-fence.test.ts`) and on Windows
  (`fence/srt-fence.windows.test.ts`).
