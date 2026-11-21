# Decision: the routines host's Run now tests move to their own file

- Task: HAL-15082
- Approval: HAL-15082; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:i4wBLfjiUIlK+We1gBdJetN54vqL6VoxdVwK4qQhmHblF1DrikpN4JrH8O/wV3sippnCpDVqf7SJpENZU1xLDA==

## What changes

- The routines host's Run now tests (start through the engine, engine not answering, the window's
  own refusals, the trust check) move unchanged from
  `apps/studio/src/routines/workspace-routines.test.ts` to
  `apps/studio/src/routines/workspace-routines-run-now.test.ts`.
- So fewer tests run in `workspace-routines.test.ts` than on the merge base. Every test the merge
  base had still runs, in one file or the other, with the same name and the same checks. One new
  test ("lists the errors in a routine's file, such as a value its trigger doesn't have") stays in
  `workspace-routines.test.ts`.

## Why

The new test made `workspace-routines.test.ts` 523 lines, over the repo's 500-line limit for one
file. Splitting off the Run now tests keeps both files under it without dropping any check.

## Covers

- apps/studio/src/routines/workspace-routines.test.ts
