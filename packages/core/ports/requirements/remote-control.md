# ports.remote-control

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decision 13 (HAL-12232); task HAL-12235; design "Tunnel phase B screens" (HAL-12206), decisions 1, 5, 10, 12, 13, 21–23

The `RemoteControl` port (version 1) shall be how Studio, on loopback to the host, turns remote on and off, pairs a phone, lists and revokes paired phones and sets the risky-approvals switch. Its state shall be one snapshot: whether the host offers remote at all, whether remote is on, the tunnel provider's id, the tunnel's state and reason, the risky switch (off by default), the paired phones and whether a pairing is open. A paired phone shall carry only public data: its id, its name (with " (2)" and so on for a name already paired), its platform, when it was paired, when it was last seen and whether it is connected.

A pairing shall be a stream of events: `code` with the code, the QR text, the host's name and when the code ends; `check` with the check code, the phone's name and platform and when the wait for Allow ends; then exactly one of `paired` with the phone, or `ended` with a listed reason, which for `tunnel-down` carries the tunnel's own reason. Allow and Don't allow shall be refused unless the pairing is at `check`. Only one pairing shall be open at a time. Starting a pairing shall turn remote on, and a pairing that ends without a phone shall turn it off again if it did so and no phone is paired. Revoking shall unpair the phone and close its session; an id that isn't paired does nothing. The risky switch shall be settable while remote is off.

## Examples

- Given the port,
  when its methods are listed,
  then they are exactly `state`, `setRemote`, `startPairing`, `revoke`, `revokeAll` and `setAllowRiskyRemotely`.
- Given a pairing session,
  when its methods are listed,
  then they are exactly `events`, `allow`, `deny` and `close`.
- Given the end reasons,
  when they are listed,
  then they are `denied`, `allow-timed-out`, `code-expired`, `too-many-tries`, `closed`, `remote-off`, `tunnel-down` and `busy`.
- Given a paired phone,
  when its fields are listed,
  then none of them is a key or a secret.
