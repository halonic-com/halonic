# Decision: the CLI budget lines say "less than" for a tiny amount

- Approval: HAL-12034, decided by Liam with Kim for the words (from HAL-12012). Liam reviews this pull request, so he signs the note.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:LB2uJZtYHdR6XStO5kuy9z9oT00hnf1OclACt2n98bjv43P5i4DfK4CYYOLc0ptmHanBoBaTdyLtEnh16rnJDg==
- Task: HAL-12034

## What changes

- `cli.run-failure` words a tiny amount in the budget lines as "less than €0.001": "its budget of less than €0.001" and "(estimated less than €0.001 spent)", instead of "budget of under €0.001". The examples change to match. Only the tiny-amount path changes; other amounts and other lines read as before.

## Why

"A budget of under €0.001" reads oddly. "Less than" reads naturally in both budget lines.

## Covers

- app.money-amount
- cli.run-failure
