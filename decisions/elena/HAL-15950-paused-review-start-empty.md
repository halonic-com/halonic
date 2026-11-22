# Decision: a paused routine's Runs view offers Review, and an empty start field says the routine won't start

- Task: HAL-15950, from flow check C656 #4 and #5 on HAL-15937
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15950 (a button on an approved empty state that opens the trust check the app already has, and one sentence in place of two for one field, so a team decision under the HAL-2282 rule; Liam's code review signs this note)
- Kind: user-visible

## What changes

- `routines.runs.view` (edited): "It's paused until you trust this workspace." now comes with **Review**, which opens the window's trust check (`host.askTrust`, the gate Run now already opens), where the app has one. Without a trust check there is no button. The example says so. Nothing is taken out.
- `routines.starts.starts-card` (edited): the start field's hint while it is empty was "*Name* needs this. Left empty, it starts with nothing to work on."; it now says the same sentence as the field's error, "*Name* needs this. Left empty, the routine won't start." To make that true, clearing the field takes it out of the input (before, it wrote `""`, which the engine starts with), so the engine's `missing-routine-input` check refuses the start, as the CLI's `validate` and `routines` already say. The example adds that clearing the field writes `{}`.

## Why

C656 #4: the paused words didn't say where trust happens. The CLI names `halonic trust`; Studio's place is the trust check, so the sentence now opens it. The list's chip "Paused until trusted" stays as it is: it matches the CLI's chip, and the title bar's "Not trusted yet · Review" badge on the same screen opens the same check.

C656 #5: one empty field had two consequences. Iris asked for the error's ("the routine won't start"), which is what the engine and the CLI say.

## Docs

No guide quotes these lines.

## Covers

- routines.runs.view
- routines.starts.starts-card
