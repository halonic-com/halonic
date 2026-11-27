# Decision: say "can't run" for a refused stepper, and don't refuse before the connections are read

- Task: HAL-20487
- Approval: the wording was decided by the team on HAL-20487 (https://paperclip.halonic.com/HAL/issues/HAL-20487), with Sofia as designer, from her check of #6768 on HAL-20482. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:IPqlJBeXE0tEp2MEpJ3Ku91QwwZZzb2kjvXBtaN2CEDf0OdyCIQSpz9Z3BFgw3doIUKpU30xsA6wpYEIrCD7CA==

## What changes

A request the stepper won't run now shows under the title "Halonic can't run this card's stepper:"
instead of "This card has a stepper Halonic can't read:". Halonic can read these requests; it only
won't run them. A Paperclip request on a connection with no key now gives "this computer isn't
signed in to `<host>`: sign in to it in Settings › Connections", because a computer signs in, not
a host.

The Inbox used to treat "connections not read yet" as "none connected", so a Paperclip request
opened straight from a notification was refused, then swapped for the stepper, and the focused
heading went away. Now the request waits in review mode until the connections are read and is then
checked again in the same card. When the read fails, the card gives "Halonic couldn't read your
connections in Settings › Connections" with only **Decline**.

The requirements `action-steppers.paperclip-host` and `inbox.agent-action-items` are updated to
say this. Tests are added for the waiting and failed reads; the changed strings are compared
exactly. No test was weakened or skipped.

## Covers

- action-steppers.paperclip-host
- inbox.agent-action-items
