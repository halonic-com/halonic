# Decision: a check that finds more than one match is a failed step, worded by Halonic

- Approval: /HAL/issues/HAL-20267 (Liam's OK on option 1, a structured signal, with his three conditions; found in the security review of #6718 on HAL-20263)
- Kind: user-visible

Since #6718 the shell answered a Cloudflare step whose list held more than
one match with status 200, nothing kept and its own sentence in `error`.
Studio recorded every 2xx as `action.step.succeeded`, so the step read
"Done." and the run went on. Had it been recorded as failed with that
answer, the step would have said Cloudflare "refused" it and **Copy
details** would have quoted Halonic's own sentence as Cloudflare's.

The answer now carries a structured signal instead of text:

- `ports.action-sender`: an answer may carry `unusable: "more-than-one"`,
  only on a successful status of a `GET` step, with nothing kept and no
  error text. `error` stays the service's own message for a failed status
  and is never set on a successful one. The shell sends no sentence with
  it, so Studio never has to match or quote text to word it.
- `services.action-steps`: such an answer is recorded as
  `action.step.failed` with the new failure `more-than-one` and the
  status, not as `action.step.succeeded`.
- `action-steppers.run`: the step's line reads "Failed. The service found
  more than one match, and this step works on exactly one. (status 200)",
  and **Copy details** copies the same words unquoted. Neither says the
  service refused the step or quotes the words as the service's.

The shell applies the rule only to `GET` (check) steps. A write that
answers a list keeps nothing and still succeeds, so a change that already
happened never reads as failed and invites a second run. `ActionStepFailure`
in `@halonicjs/events` gains `more-than-one`, and the shell's record check
and the shared golden take it too.

The user sees nothing yet: GitHub never gives this answer, and no Cloudflare
route reaches a build until `shellServices` lists `cloudflare`.

## Covers

- ports.action-sender
- services.action-steps
- action-steppers.run
