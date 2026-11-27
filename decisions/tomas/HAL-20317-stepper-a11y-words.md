# Decision: a value a check couldn't find reads "nothing found"

- Approval: https://paperclip.ing/HAL/issues/HAL-20317
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8VC4MC6/byFLr/oRYRR32Etgc/Scosj03MzNMfivxtv2rcezzdwzPwgyGCIcZftH312I/7OYF3eq6MmWqCWlCg==

When a request stops because what its `check` step kept differs from the request's `expect`, the
stepper shows each changed value as "When asked: …" and "Today: …". For a value the check didn't
find at all, the second line said "Today: not read". Read aloud, "not read" can be heard as
"unread", as if nobody had looked yet. Noah's copy check (#6714, on HAL-20312) asked for
"nothing found" instead, so the line now reads "Today: nothing found". The team decides this
wording under the board's rule for small wording (HAL-2282).

`action-steppers.expect-stop` gets one more example, for a value the check didn't find, so the
words are written down with the requirement. Its sentence doesn't change. The test in
`action-stepper-changed.test.tsx` that names the requirement now expects "Today: nothing found",
with the same number of `expect` calls.

## Covers

- action-steppers.expect-stop
