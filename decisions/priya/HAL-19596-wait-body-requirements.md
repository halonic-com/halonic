# Decision: the waiting-run requirements name the wait's body

- Approval: HAL-19596 (found by Julian in the review of #6493, HAL-19560)
- Kind: user-visible

#6406 (HAL-19285) made `halonic run` and `halonic runs show` print the wait's body between
"! Waiting for you" and "Answer with:", and changed the tests and the golden with it. These
requirements now say so. No behaviour changes, no test changes, and each `Since:` stays.

## Covers

- `cli.commands.runs.show`
- `cli.run`
- `cli.commands.runs.show-waiting-child`

## What changes

- `cli.commands.runs.show`: a waiting run's ending prints the wait's body, when it has one, between
  the "! Waiting for you" line and the way to answer, each line indented 2 spaces with a blank line
  before and after; a wait without a body and a tool approval wait print none. The Approve this
  reply? example shows Support reply's body, and a new example shows a wait without one.
- `cli.run`: the waiting lines include the body, as `cli.commands.runs.show` says; the first example
  names it.
- `cli.commands.runs.show-waiting-child`: the parent carries the child's body with its waiting
  line, as `waiting-child.test.ts` already checks.

## Why

The CLI README (#6493) cites `cli.run` and `cli.commands.runs.show` for the body, and the
requirements still said a waiting run ends with two lines.
