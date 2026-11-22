# Decision: a misspelled `to:` doesn't also make the next step's template names unknown

- Approval: Liam approves this change on HAL-15394 (https://paperclip.halonic.com/HAL/issues/HAL-15394), from Nina's check C567 (HAL-15383). A follow-up to HAL-14277 (#4423); a team decision with no board card (HAL-2282 rule).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2L1qgKjYel+lwmCYlSN4EeeqSgpJsYvtcQtCshASMV1z2uQoh7GDQhABPuG/ZTACbfVhDapMY2m52p8zVltZDw==

## What changes

- Since #4423, a transition to an unknown state counts as going to the state its "Did you mean"
  names when `validateWorkflow` looks for unreachable states. The checks `unknown-gets` and
  `unknown-template-name` now follow the same guess when they look for the steps that run
  earlier. In `examples/acme` with Draft's `to: review` changed to `to: reveiw`, `validate` gave
  the `unknown-target` error and also `"review" uses {{context.reply}}, but no earlier step
  writes context.reply.`; now it gives only the first, the one the person can fix on its line.
- Without a likely state nothing changes: the step after it still can't read those keys, and
  is still unreachable.
- `contextBefore` keeps its behaviour by default (`workflow.context-before` is unchanged); the
  checks ask for the guess with the new option `{ followGuesses: true }`. The guess itself moves
  into one helper, `likelyTarget`, which the reachability check uses too.

The requirement `workflow.unknown-name-hints` says this, with a new example. Tests are added for
the guess and for no guess in `unknown-name-hints.test.ts`, and for the option in
`inputs.test.ts`. No test was weakened or skipped.

## Why

One typo should give one error. The second error pointed at a line that was right, so the
person couldn't fix it there and might "fix" the template instead.

## Covers

- workflow.unknown-name-hints
