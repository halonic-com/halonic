# Decision: serve says when a webhook routine's secret name belongs to Halonic

- Approval: HAL-14299; freeze exception HAL-14550 on HAL-14331; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BXd+C4O+fcz/OyYxNSDSd4F2HWpmZbhm9VuQpOp4r9DuphebqUe77oS6KncHUjLQpT43RpKSPCN4EdsBXaGYCA==

## What changes

- `halonic serve` (`cli.commands.serve.serve`): when a webhook routine that is on names a
  secret that belongs to Halonic or a plugin, such as `serve-password`, the line under its
  address says "✕ Friday digest won't start: its secret name serve-password belongs to Halonic
  or a plugin. Use a name of your own in its routine file." It names no `halonic secret set`.
  A routine whose own secret isn't set keeps the line from HAL-14299-routines-wont-start.

## Why

The server never accepts a reserved name for a webhook, so such a routine never starts. Before
this change `serve` said the secret wasn't set and suggested `halonic secret set serve-password`,
which would overwrite the sign-in password and still not start the routine. The fix was meant to
ride in #4211, which merged without it, so the board made it a freeze exception (HAL-14540,
rule 4 on HAL-14331). The wording follows the approved "what is wrong" and "what to do" form;
Julian reviews it.

## Covers

- cli.commands.serve.serve
