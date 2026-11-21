# Decision: a `private` setting may hold a host name

- Approval: Liam decided option 1 on HAL-15005 (21 Nov, 16:28 UTC), and approves this note in his review of this pull request; Julian checks it as the second reviewer of a security change
- Kind: user-visible
- Task: HAL-15005

## What changes

**Integration settings (`format`).** A `{ fromSetting, class: private }` host takes a host name
over `https` too, not only a private IP address, so `https://<name>.ts.net` works with
Tailscale's own certificate. `integrationPolicy` lists each such name in the policy's new
`privateNames`. Unchanged: `loopback` takes only `localhost` and loopback addresses; `localhost`,
`*.localhost` and addresses outside every class (such as `169.254/16`, `[::]` and
`100.100.100.100`) are still refused under every class; `public` is unchanged; plain `http` to a
name is still refused (`plain-http-not-local`), with or without a key, so a private name always
has a certificate tied to it.

The requirement `format.integration-host-class` changes in place: its `private` clause, a new
sentence on where a name is checked, and its examples. One existing example moves:
`https://nas.example.com` under `class: private` passed `setting-outside-class` before and now
passes. The test that listed it as refused lists it as accepted, and new tests cover the names
that stay refused.

**Where the limit is enforced.** The class check reads only the URL's text, so for a name it
can't prove where the name points. The integration's transport does, at connect:

- `AddressCheckingHttpClient` gets an optional `withPrivateNames(names)`. The Node transport
  implements it: those names count as `private`, so it resolves each on every request, keeps
  only the private addresses of the answer, pins the connection to them (`fixedLookup`) and
  never sends them through a proxy (`routeFor`). An IP address keeps the class its text gives.
- The kit's loader calls it for every integration with `privateNames`. A transport without it
  is refused with `private-name-unchecked`, before any runner starts, rather than treating the
  name as public or unchecked.
- Before this change the CLI's integration transport counted every name as `public`
  (`connectorHostClass`), so the loader's call is what makes a private name work at all; without
  it, a Tailscale name would still be refused at connect.

**Transports checked.** Every place that gives an integration a transport:
`apps/cli` `local-integration-machine` (the Node transport, now built by `integrationTransport`),
`apps/agent-host` `host-plugin-machine` for plugin backends (the Node transport), the conformance
suite's replay (`testing/integration`, never connects, so it takes the names and changes
nothing) and the sign-in rig (`testing/sign-in`, a loopback test server without
`withPrivateNames`, so it would refuse a private name). Nothing else builds an
`AddressCheckingHttpClient`.

`privacy.localOnly` is unchanged: a `private` setting already counted as local, because the
runner checks its addresses on every request, and that is still what keeps a name local.

## Why

The board's promise on HAL-1873 section 5 is that the sheet declares the class and Halonic
refuses anything outside it, so "only on your home network" holds. It still holds: a private
name reaches only private addresses. Only the place it is enforced moves, from the text check to
the connect step, the same place that already guards public names. The trust check's row is
unchanged: the setting's value in mono and "only on your home network".

Option 2 (a key over plain `http` to `100.64/10`) would send a key in the clear over a network
Halonic can't tell apart from a carrier's. Option 3 (no change) doesn't help our own server.
