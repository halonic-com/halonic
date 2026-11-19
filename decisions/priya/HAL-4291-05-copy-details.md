# Decision: Copy details for `other`, and a phone fix that names the thing

- Task: HAL-4291 (the can't-run Callout's follow-up, PR 5)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-4291 (the CTO's scope for this task: checklist Part 3 of HAL-1833 and microcopy 23.3; the CTO's review of PR 1 asked for the phone fix; the words stay placeholders by key until HAL-1784)
- Kind: user-visible

## What changes

- `app.sandbox-start-check`: for `other` only, the answer now carries the check's own sentences
  as `details`, one per line. Before, the answer never carried them. For every other reason it
  still doesn't, and no screen shows them: they go only to **Copy details**.
- `app.sandbox-start-words`: a seventh part per reason, the can't-run Callout's fix for a phone.
  For `bubblewrap-missing` and `user-namespaces-restricted` it names the thing ("install
  bubblewrap, …"), like the can't-run Callout's own fix; for every other reason it is the phone fix.
- `runs.sandbox-cant-run`: for `other`, the Callout offers **Copy details** after the guide. It
  copies the first line, the reason and the check's own sentences. On a phone the Callout shows the
  new phone fix instead of the phone fix that says "install it".

Nothing the requirements promised before is taken away, except that `other`'s answer may now
carry `details`. The rule that the check's sentence never reaches a screen (HAL-2089) stays, and
a test checks it.

## Why

Checklist 3.2: for `other` the Callout shows **Copy details**, and only Copy details carries the
check's own sentence. `other`'s code says nothing about what is missing, so without the sentence
a bug report would say nothing either. The phone fix said "install it" with no reason before it,
which is what the can't-run Callout's own fix was added to avoid (review of PR 1).

## Tests

No test was weakened or skipped. The test that `other`'s sentence never got through now checks
that it gets through only as `details`; a new test checks that any other reason still drops it.
`sandbox-cant-run.test.tsx` checks that the sentence is copied and never on screen, that only
`other` offers Copy details, and the phone fix.

## Covers

- app.sandbox-start-check
- app.sandbox-start-words
- runs.sandbox-cant-run
