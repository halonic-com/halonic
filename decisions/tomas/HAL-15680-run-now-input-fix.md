# Decision: Run now's refusal of a routine's input says where to fill it in, without Try again

- Task: HAL-15680
- Approval: HAL-15680 (flow check C614 finding 2 on HAL-15674; the wording is row 23 of Sofia's words check C613 on HAL-15673, built on the approved routine page, decided by the team under the HAL-2282 rule). Liam signs this note at code review.
- Kind: user-visible

## What changes

When **Run now** fails because the engine refuses the routine's input, which lacks a field the
workflow's first step reads, the toast said only the engine's sentence ("The input has no field
mail, which the step Read the email reads.") and offered **Try again**, which fails the same way.
Now the refusal carries a next step, "Fill it in under Starts on the routine's page.", so the toast
says it after the reason and offers no **Try again**, as the shared start-failure line does for any
refusal whose next step is somewhere else. The engine's other refusals of an input keep their
sentence with no next step.

The active requirement `routines.page.run-now-failed` and the draft
`studio.workspace-routines-start-input` gain this sentence and an example. Their behaviour is
otherwise unchanged. In `run-now-failures.test.tsx`, the test of the engine's refusal now uses the
refused input and also checks the next step and that there is no **Try again**. In
`workspace-routines-start-input.test.ts`, the refusal is checked as the new `RoutineInputRefused`
(still a `KindedError` of kind `invalid_input`) with its next step, and a new test checks that
another refusal has no next step. No test was removed, weakened or skipped.

## Why

The person can't start the routine until the field is filled in, and the routine page already marks
the field under Starts, so the toast points there (E2: every refusal says what to do next). Found as
C614 #2; Sofia's C613 row 23 gives the words, so both checks use one wording.

## Covers

- routines.page.run-now-failed
- studio.workspace-routines-start-input
