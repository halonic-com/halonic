# Decision: the step panel's "Didn't work" line says the logged cause

- Approval: Liam approves this note in his review of this pull request on HAL-12471
- Kind: user-visible
- Task: HAL-12471

## What changes

`runs.run-view.step-failed-call` said the line under a failed tool call reads "Didn't work." for
the outcome `error` and the engine's "broke off without an answer" sentence for `unknown`,
because the log had no typed cause. The engine now logs one (`events.tool-result-cause`, PRs 1
and 2 of HAL-12471, and HAL-13829). When the events package's reader `toolFailureCauseOf` reads a
cause, the line says it instead: how many seconds the tool had, that Halonic stopped while it ran,
why the call wasn't made, or which program or secret a connector that didn't start missed. A
result without a cause, or with one the reader doesn't know, keeps the old line. The "Limits"
paragraph now says what the line still can't show.

## Why

So a person reads "the tool `search_pages` (*notion*) didn't answer within 60 seconds" or "its
program `acme-notes-mcp` isn't on this computer" and can act on it, instead of a bare "Didn't
work." (microcopy 1.6, E1).

- The time-limit line is microcopy 1.6's own example, with ", so it may or may not have done its
  work." added: a call that ran out of time ends `unknown`, like one that broke off, and the person
  needs to know to check.
- The connector-start lines are the ones the team decided on HAL-13829. The engine-stopped and
  not-made lines are small wording on an approved screen, decided on HAL-12471 under HAL-2282.
- The program and the secret are names the cause holds, cut to 120 characters by the engine and
  escaped like every value from the log; the line never shows a secret's value or the result's text.

## Tests

No test was weakened or removed. `step-failed-call.test.tsx` gains cases for every cause code and
reason, a cause without a name, a call whose connector the log doesn't name, a name with a hidden
character, and a cause code the reader doesn't know.

## Covers

- runs.run-view.step-failed-call
