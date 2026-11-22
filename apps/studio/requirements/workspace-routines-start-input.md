# studio.workspace-routines-start-input

- Status: draft
- Since: unreleased
- Source: HAL-15336 (RT2 and RT3 of the Routines UX check, HAL-15304); UX check S5 of HAL-12390; HAL-15680 (C614 #2)

The desktop app shall tell the Routines feature, for each routine, whether the routine's input lacks a field its workflow's first step reads (`missing-routine-input`, as `halonic validate` reports it), since the engine refuses such a start. When Run now's start fails, it shall pass on the engine's refusal of the input with the engine's own sentence, and for an input that lacks a field with the next step "Fill it in under Starts on the routine's page.", keep the sentence of any other refusal, `unavailable` ones included, and say the engine isn't answering (`EngineNotAnswering`) only when the engine can't be reached.

## Examples

- Given the routine Morning replies starts Support reply, whose first step reads `mail`, with the input `{}`, then its view says its input lacks a field, and the list gives the problem `halonic validate` reports.
- Given the routine's input is `{ mail: "" }`, then its view doesn't say so.
- Given the engine refuses the start with "The input has no field mail, which the step Read the email reads.", then Run now rejects with that sentence and the next step "Fill it in under Starts on the routine's page.", not with `EngineNotAnswering`.
- Given the engine refuses the start with "Run \"r1\" has already started.", then Run now rejects with that sentence and no next step.
- Given the data folder can't be written, then Run now rejects with "Halonic can't write to its data folder.", not with `EngineNotAnswering`.
- Given the background engine isn't reached, then Run now rejects with `EngineNotAnswering`.
