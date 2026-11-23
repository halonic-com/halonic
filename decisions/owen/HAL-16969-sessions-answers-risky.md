# Decision: gateway message version 3, with the risky switch in the session list

- Task: HAL-16969
- Approval: plan approved by Liam on HAL-16968; the protocol details (session version apart from message version, pushed `sessions`) approved by Liam on HAL-16973
- Kind: user-visible

## What changes

- `ports.remote-gateway-protocol`: the message version goes from 2 to 3. Every `sessions` carries
  `answersRisky`, the person's "Let phones answer risky approvals" switch as the host read it. It
  is only a hint for what the phone shows. When the switch changes, on or off, the host pushes the
  full list again without `replyTo` to every phone past `welcome`. The host still reads the switch
  for every answer, so the gate doesn't change.
- `ports.remote-gateway-session`: the Noise prologue stays `halonic-gateway/2` and now names the
  *session* version (handshake and framing), kept in its own constant, `gatewaySessionVersion`.
  It changes only with the handshake or the framing, never with the messages.

## Why

The phone has to know the switch to show Approve only when an answer can land (PR 3 of
HAL-15194). Before this, raising the version also changed the prologue, so peers of different
versions failed the handshake the same way as a wrong key and the phone could only say it can't
connect. With the versions kept apart, the check happens in `hello`/`welcome` inside the
authenticated session, and the phone can say an update is needed. Nobody in the middle can change
the message version, because it travels inside the session.

## Tests

No test was skipped, deleted or weakened. Tests that sent version 2 now send 3, and the
attack suite's "hello of another version" list now includes 2, the old page. New tests: forced
`answersRisky: true` with the switch off still gets `not-allowed-remotely`; off, on, off ends
`false` on the phone; the host refuses an old page and lists nothing; the phone shows "update
needed" against an older host; and the e2e-noise transcripts use the gateway's own prologue.

## Covers

- ports.remote-gateway-protocol
- ports.remote-gateway-session
