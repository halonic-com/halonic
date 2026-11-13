# Decision: MXC's fence proof and canary also probe the router and the local network

- Approval: HAL-8306 (Liam, CTO, MXC ship gate part 2)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nAFBZvnEh5VYIbOp0KFz6T2qUff7HP2FfdgnFdfP4N2CEUb5BmYNnLZWwrqHMV2xlK1bNop/fLoFjkOPIHmUBw==
- Task: HAL-8306

The probe program inside the MXC box now also tries the router's usual address and one other
address in each private range the computer is on, so a box that could reach the home or office
network no longer passes the fence proof or the canary. The interface of `core/app` doesn't change.

## Covers

- `sandbox-mxc.session`
- `sandbox-mxc.canary`

## What changes

- The probe tries a TCP connection (ports 80 and 443) to one address in each private IPv4 range
  the computer is on (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) and to one address in each
  unique local IPv6 network (fc00::/7) it is on. The address is the first usable address of the
  subnet, where the router almost always is, or the last usable one when the computer has the
  first itself. Link-local, loopback and public addresses are left out.
- The results use the same rules as the other network probes (`network-probes.ts`): a connection
  is a leak, a refusal is blocked, a timeout is blocked only when the bridge, the network
  control, connected, and anything else proves nothing.
- A reached address maps to the existing `port-reachable` code, in the fence proof's sentence and
  in the canary. **No new code, so no change to `core/app`.**
- Nothing listens on these addresses, so nothing opens a port on the person's computer.

## Why

The host's own addresses were covered (HAL-7840), but the router and the other machines of the
local network were not: a box that gets out to them reaches devices the person never meant to
expose.

## Known gaps

- The router's address is a guess (first usable address of the subnet), not the default gateway
  read from the system. Reading it needs a process start (`route print`), a reviewed entry in
  `process-starters.json`.
- A connection refused by the router itself looks like a refusal by the fence. Only a
  connection that connects is proven a leak.
- The bridge's own leaks (`CONNECT`, a request for another host or port) are not probed: they
  need the bridge package.
