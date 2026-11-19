# Decision: a run's connector call looks its tool up among the tools `allow` keeps

- Approval: HAL-13288; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:L+zKwAO9X0yxKux9ZE/VAOy3O8pzDKvv8pe/T6sCtErLFec0bdR405u+iWawiDq3xLiHNkIKC6KY59Y4WN3LAA==

## What changes

`engine.run-connector-allow` said a run's model call is offered only the tools a connector's
`allow` keeps. It now also says that when the engine makes a call the turn asked for, it looks the
tool up among those same tools, so a tool `allow` leaves out is neither called nor checked for a
person's approval, and no person hears that it waits. A new example covers the docs recipe
(`agent-with-a-tool`): only `read_text_file` is allowed and approved, the call is made, and nothing
is reported as waiting.

## Why

`makeConnectorCall` listed the connector's tools again, unfiltered, to find the one the effect
names. That listing went through the approval step, which reported every tool outside `allow` as
waiting. `halonic run` then told the person to approve 15 tools agents are never offered, which the
docs page rightly says are hidden (HAL-13288, found by C161). The call step now reads the same
`allowedToolsOf` view the turn was offered, so the turn and the call agree, and a call to a tool
outside `allow` is refused at the call too, not only by the gate before it.

## Covers

- engine.run-connector-allow
