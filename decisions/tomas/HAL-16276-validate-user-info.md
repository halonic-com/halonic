# Decision: trust's reason for an address with a user name or password is said in plain words

- Approval: the task HAL-16276 asks for this change, from Iris's flow check C692 on HAL-16271 (item 3); wording decided by the team under the HAL-2282 rule; Liam signs this note in review.
- Kind: user-visible
- Signature:

## What changes

The trust check's reason for a connector or provider address with user info changes from "the URL has user info" to "the address has a user name or password in it". The reason comes from one place, `trustUrl`, and every requirement below only quotes it, so each quote changes to the new words and nothing else in them changes:

- `cli.commands.routines.list`: the rule's quoted line and one example's output line.
- `cli.commands.trust.review-and-trust`: one example's output line.
- `app.trust-service`: one example's reason.
- `workspace.trust-integrations`: one example's `‹refused: …›` value.

What is refused, when, and that the address is never shown stay as they were. No requirement is retired or weakened.

## Why

"User info" is a URL term most people don't know. The person reading the line needs to know what is wrong with the address, so the reason says it. `halonic validate` now lists the same reason before `halonic trust` refuses the file (the new `cli.commands.validate.trust-refused`), so a new user meets it first in the check meant for that.

## Tests

No test was weakened or skipped. The tests that quoted the old reason (`trust-url`, `trust-content`, `trust-integrations`, `trust-providers`, `trust-service`, the CLI's `trust`, `routines` and `run` refusals, the trust check's integration lines and the Studio's trust badge) expect the new words; each still checks that no part of the address is shown.

## Covers

- cli.commands.routines.list
- cli.commands.trust.review-and-trust
- app.trust-service
- workspace.trust-integrations
