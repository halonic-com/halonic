# Decision: Copy details on the can't-run Callout for `other`

- Task: HAL-14960 (left over from HAL-4291: PR #3905 was closed in the PR freeze; its phone fix already landed through #3891)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-4291 (the CTO's scope for this task: checklist Part 3 of HAL-1833 and microcopy 23.3; the words stay placeholders by key until HAL-1784)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:U2HR0Sjr9m87dzOhrA/DfF6A5gOjBLGIG43XBSTNSEB9+h78cDx4MPfro69XUFySD+PaQuMt23Xz5EYLOE5FCw==

## What changes

- `app.sandbox-start-check`: for `other` only, the answer now carries the check's own sentences
  as `details`, one per line. Before, the answer never carried them. For every other reason it
  still doesn't, and no screen shows them: they go only to **Copy details**.
- `runs.sandbox-cant-run`: for `other`, the Callout offers **Copy details** after the guide. It
  copies the first line, the reason and the check's own sentences.

Nothing the requirements promised before is taken away, except that `other`'s answer may now
carry `details`. The rule that the check's sentence never reaches a screen (HAL-2089) stays, and
a test checks it.

## Why

Checklist 3.2: for `other` the Callout shows **Copy details**, and only Copy details carries the
check's own sentence. `other`'s code says nothing about what is missing, so without the sentence
a bug report would say nothing either.

## Tests

No test was weakened or skipped. The test that `other`'s sentence never got through now checks
that it gets through only as `details`; a new test checks that any other reason still drops it,
and one that `other` with no sentence has no details. `sandbox-cant-run.test.tsx` checks that a
made-up sentence is copied and is nowhere on the page, before and after the copy, and that only
`other` offers Copy details.

## Covers

- app.sandbox-start-check
- runs.sandbox-cant-run
