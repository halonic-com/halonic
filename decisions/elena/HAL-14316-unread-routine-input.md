# Decision: a routine's input key that the workflow doesn't read is a warning at the routine

- Approval: HAL-14316; split from HAL-14298 (C340 C30 (a), Nina's check on HAL-14271, row 10); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:LxIk17tEusciUYf//rC/6e3hZWlf5U4dGjJp2ZW3PMUCbV+5oBHp8Jx2c/+MD59MaIbXOqHc2i1glFkEk84qDQ==

## What changes

The new `workspace.routine-input` warns with `unread-routine-input` at `run.input.<key>` when no
step of the routine's workflow reads `input.<key>`, with "Did you mean input.<field>?" when one
field is close, or else the fields the steps read. A workflow with a step that sends its agent
the whole input isn't checked.

`workspace.workflows` and `workflow.validate-input` (HAL-14267) counted a routine's input keys as
the workflow's input fields. They now count only the keys of the workflow's tests' inputs, and
`workspace.workflows` points to `workspace.routine-input` for routine keys.

## Why

Nina's row 10: a routine with `input: { dya: ... }` for a workflow that reads `input.day` fired,
showed ✓ and wrote "Today is .". `validate` said "No problems".

With HAL-14267 alone, that typo became an error on the workflow, at the step that reads the right
name, with "Did you mean input.dya?". It sent the user to break the correct file. A routine key
no step reads is now reported where the typo is, and the workflow's own check uses only its
tests, which describe its input. The check is a warning, as C30 (a) asks: an extra key does no
harm by itself, and a workflow can read its input in ways the check doesn't see (the whole input).

The wording follows the approved C336 form, what is wrong and then what to do, so it is a team
decision (Liam, on the task).

## Tests

No test was weakened or skipped. `routines.test.ts` covers a close key (code, path and line), no
close key, a field read in a step's text, and a workflow that sends the whole input. The CLI test
(`validate/routine-input.test.ts`) runs `validate` on Acme with row 10 and checks the line
and exit 0.

## Covers

- workspace.workflows
- workflow.validate-input
