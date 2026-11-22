# Decision: Local only saved on counts before it's made live

- Approval: option 1 of the plan is approved on HAL-16400 (Liam's comment of 22 Nov, with four conditions); Liam approves this note in review
- Kind: internal
- Task: HAL-16400

## What changes

`studio.engine-service` read Local only only from the version a start reads, which is the live version
in a workspace with history (HAL-14229). The old text:

> When that version has turned `privacy.localOnly` on or off since the engine opened, a start or send
> shall close the engine and open a new one built with the new setting, …

The new text:

> Local only shall count as on when that version or the saved `workspace.yaml` sets
> `privacy.localOnly: true`, so turning it on takes effect at the next start, before it is made live,
> and turning it off waits until it is made live (HAL-16400); while that version has it off, a saved
> `workspace.yaml` that can't be read or has an error shall refuse the start, send or routine's start
> as `invalid_input`, with words such as "The saved workspace.yaml has an error on line 4, so Halonic
> can't tell whether Local only is on. Nothing started." and "Fix the error in workspace.yaml, then
> try again." for an error, never count as off. When Local only, counted that way, has turned on or
> off since the engine opened, a start or send shall close the engine and open a new one built with
> the new setting, …

Two examples are added: Local only saved on but not live keeps a start and a routine's start off the
cloud model, and Local only saved off but not live still keeps them off it until it's made live. A run's
definitions still come from the version it records; only the engine's Local only is stricter. Nothing
changes with history off or while nothing is live, where the saved files are already what the engine
reads.

The fakes of `engine-service-saved-files.test.ts` move, unchanged, to `engine-local-only.testing.ts`,
so the new tests share them. No test there changes or goes.

## Why

Since HAL-14229, someone who turned Local only on in Settings and saved could still get a cloud model call
from Run, the Inbox form, Run now or a routine until they made the change live (Liam's review of #5157).
Counting the stricter of the two closes that with no new wording on the Settings screen, and never lets
a run make a cloud call the person just turned off, nor one they haven't made live. A saved file that
can't be read might be turning Local only on, so it fails closed (Liam's condition 1). The CLI keeps
reading the live version only; matching it is HAL-16406.

## Covers

- studio.engine-service
- apps/studio/src/engine/engine-service-saved-files.test.ts
