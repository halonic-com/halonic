# Decision: Tailscale's 100.64/10 counts as a private network

- Approval: Liam decided option 1, with the `100.100.100.100` carve-out, on HAL-14783 (21 Nov, 05:34 UTC), and approves this note in his review of this pull request; Julian checks it as the second reviewer of a security change
- Kind: user-visible
- Task: HAL-14783

## What changes

**Address classes (`http-kit`).** `100.64.0.0/10`, the shared range Tailscale's addresses sit
in, moves from `reserved` to `private`. Tailscale's own service address `100.100.100.100`
(MagicDNS and the local client) stays `reserved`, and Alibaba's metadata address
`100.100.100.200` stays `metadata`. Both come ahead of the wider block, as the metadata
carve-outs already do. `100.63.255.255` and `100.128.0.0` stay `public`.

**Integration settings (`format`).** A `{ fromSetting, class: private }` host takes a literal
address in `100.64/10` too, apart from those two service addresses, and the refusal message
names `100.64/10`. The format keeps its own copy of the ranges (the core can't import an
adapter); both copies change together.

What follows from the shared classes, with nothing else changed:

- The Node transport lets a `private` host reach a `100.64/10` address and still refuses one
  for a `public` host. A public name that resolves into `100.64/10` is refused at connect, as
  before.
- The integration kit sends plain `http` to a `100.64/10` local host, as to `10/8`. A key still
  goes over plain `http` only to this computer.
- An `http` connector written as `http://100.x.y.z/...` counts as `private` (it had no class
  and was refused), and goes past the user's proxy, as other private hosts do.
- A `private` setting in `100.64/10` counts as local for `privacy.localOnly`, as every
  `private` setting already does.

## Why

Tailscale's IPv6 range (`fd7a:115c:a1e0::/48`) already sits in `fc00::/7`, which is `private`,
so refusing its IPv4 twin was inconsistent rather than a deliberate line. The rule that protects
users stays: a `public` host reaches only public addresses, and a `100.64` address is reached
only when the user's own setting says `private`, which the trust check shows. On some ISPs
`100.64/10` is the carrier's own network, so such a setting could reach the carrier's devices;
the same is already true of `10/8` on many ISP and hotel networks, and it still takes a private
setting the user chose. The requirement says so.

## Not in this change

The Paperclip integration's sheet (`tool-paperclip-issues`, in `halonic-com/integrations`)
stays as it is here. A `private` setting must be a literal address, and its key may go over
plain `http` only to this computer, so the sheet's move to `class: private` is a separate
question on HAL-14783.

## Tests

No test was weakened or removed. The two `100.64/10` cases in the address classes' attack-case
list move to the private block edges (`100.64.0.0`, `100.116.12.34`, `100.127.255.255`), and
`100.100.100.100` joins the reserved ones. New cases cover the public edges `100.63.255.255`
and `100.128.0.0`, a home-network host allowed `100.116.12.34` and refused `100.100.100.100`
and `100.100.100.200`, a public host refused at connect for `100.116.12.34`, a private host's
mixed answer keeping only the Tailscale address, the kit's local hosts, and the format's
`private` class taking `https://100.116.12.34` and refusing the two service addresses and
`100.128.0.1`.

## Covers

- format.integration-host-class
