# Decision: the window refuses what its engine can't answer, and says so

- Task: HAL-13318 (follow-up to #3913, from checks C267 AN3 and C270); HAL-13973 (check C275 SR1, SR2, TU1, CW1); HAL-14007 (check C285 TU2)
- Approval: Liam, in review of HAL-13318
- Kind: user-visible

## What changes

1. **Approve of a connector's tool call the window can't make.** Where no
   agent host runs, the window's engine starts no connector; where one runs,
   it starts a run's `stdio` connectors only for a run on the saved files
   (HAL-13344), so not for a run the CLI started at a commit. An Approve of
   such a call would fail the run at that call ("can't carry out a call-tool
   effect"). `EngineService.send` now refuses it as `unavailable` before
   anything is recorded, with `halonic runs send <short id> approve` as its
   `fix`. An Approve the window can carry out (agent host, saved files) goes
   to the executor. Its sentence names the
   connector as the Library does: "This window can't run tools from Notes yet.
   To approve this one, run this in a terminal:" (its id when it has no name;
   C275 CW1 found "notes's tools"). The card shows that
   sentence and the command to copy, as it already does for any answer only
   the command line can send, and the run keeps waiting. Reject and Ask for
   changes of the same call still go through the window.
2. **Another engine holds the workspace.** The lock's refusal was a
   `conflict`, which the Inbox reads as "This is no longer waiting for you",
   which was false: the run still waits. A send now turns it into
   `unavailable`, with the lock's own sentence and fix (HAL-13758) as one
   sentence, "Acme is already running in another Halonic on this computer
   (process 4242). Stop that one, then try again." The card shows
   "Couldn't record your decision." and that sentence in one paragraph, then
   **Try again**. A start keeps the `conflict`.
3. **The failure's own sentence on the cards.** `FailedLine` shows the
   sentence of an `unavailable` failure without a command right after
   "Couldn't record your decision.", and **Try again** after both, on screen
   and in the DOM, so the alert reads the two sentences, then the button
   (C275 SR1, WCAG 1.3.2). Besides the lock, that is the served computer's
   "Halonic couldn't reach the computer to send your answer.", which the
   phone's card now shows too. The old host's sentence (HAL-11626) keeps no
   **Try again**, and comes after the stale and command-line lines.
4. **The focused button stays in view.** On a phone the lines that appear
   above the bar pushed the focused Approve out of the window (195 × 421:
   432–472 px in a 421 px window). When the alert slot fills, the bar brings
   its focused button into view with `scrollIntoView({ block: "nearest" })`
   (C275 SR2, WCAG 2.4.11). No new words.
5. **A workspace that isn't trusted.** The window refuses every answer of such
   a workspace as `denied`, the same way each time, so **Try again** couldn't
   work. The alert now says "This workspace isn't trusted yet, so Studio can't
   send your answer." with **Review** and no **Try again**. **Review** opens
   the trust check of the header's "Not trusted yet · Review" (the badge's own
   `onSelect`, so focus comes back to **Review**), or Settings › Trust where
   that badge isn't shown. Once the workspace is trusted (the badge leaves
   the header) the line goes, with no **Try again** in its place, and focus
   goes to **Approve** (a wait card's first answer), after the trust check has
   closed and given focus back; C285 TU2 found the line still there.
   Reject and the wait card's answers get the same line; the Ask for changes
   dialog says the same sentence in its alert and keeps the note (C275 TU1).

Decided by the team (HAL-2282: an error state of the approved card), on the
check's wording (C267, C270, C275, C285).

## Why

Both are 0.1.0 blockers: Approve on the sample's connector call would fail the
run, and a person with `halonic serve` open was told their answer was too late.

## Covers

- studio.engine-service
- inbox.approval-card
- inbox.wait-card
- apps/studio/src/engine/engine-service-send.test.ts
- packages/studio/features/inbox/src/ui/approval-card.test.tsx
- packages/studio/features/inbox/src/ui/approval-card-refusals.test.tsx
- packages/studio/features/inbox/src/ui/approval-card-changes.test.tsx
- packages/studio/features/inbox/src/ui/wait-card.test.tsx
- packages/studio/features/inbox/src/ui/wait-card-refusals.test.tsx
- packages/studio/features/inbox/src/ui/inbox-page.test.tsx
- packages/studio/features/inbox/src/ui/workspace-trust.test.tsx
