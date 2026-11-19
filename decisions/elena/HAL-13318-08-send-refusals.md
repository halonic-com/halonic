# Decision: the window refuses what its engine can't answer, and says so

- Task: HAL-13318 (follow-up to #3913, from checks C267 AN3 and C270)
- Approval: Liam, in review of HAL-13318
- Kind: user-visible

## What changes

1. **Approve of a connector's tool call.** The window's engine starts no
   connector, so an Approve of a call from a connector would fail the run at
   that call ("can't carry out a call-tool effect"). `EngineService.send` now
   refuses it as `unavailable` before anything is recorded, with
   `halonic runs send <short id> approve` as its `fix`. The card shows that
   sentence and the command to copy, as it already does for any answer only
   the command line can send, and the run keeps waiting. Reject and Ask for
   changes of the same call still go through the window.
2. **Another engine holds the workspace.** The lock's refusal was a
   `conflict`, which the Inbox reads as "This is no longer waiting for you",
   which was false: the run still waits. A send now turns it into
   `unavailable`, with the engine's own sentence, "This workspace is open in
   another engine (process 4242). Close it, then try again." The card shows
   "Couldn't record your decision." with **Try again** and that sentence under
   it. A start keeps the `conflict`.
3. **The failure's own sentence on the cards.** `FailedLine` shows the
   sentence of an `unavailable` failure without a command under "Couldn't
   record your decision.". Besides the lock, that is the served computer's
   "Halonic couldn't reach the computer to send your answer.", which the
   phone's card now shows too.

Decided by the team (HAL-2282: an error state of the approved card), on the
check's wording.

## Why

Both are 0.1.0 blockers: Approve on the sample's connector call would fail the
run, and a person with `halonic serve` open was told their answer was too late.

## Covers

- studio.engine-service
- inbox.approval-card
- inbox.wait-card
- apps/studio/src/engine/engine-service-send.test.ts
- packages/studio/features/inbox/src/ui/approval-card.test.tsx
