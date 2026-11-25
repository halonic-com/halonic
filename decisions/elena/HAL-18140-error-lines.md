# Decision: C805 error lines name Halonic one way and give the command where one fixes it

- Approval: /HAL/issues/HAL-18140 (from the UX check C805 on HAL-18136, section A)
- Kind: user-visible
- Task: HAL-18140

## What changes

Wording on approved screens, so the team decides it (HAL-2282). The rules are N1 to N7 and E1 to
E6 of microcopy 1.5 and 1.6.

- action-steppers.run: a failed step says "Failed: GitHub refused this step (status 403)." The
  service's own message moves to **Copy details**, which copies "Status 403. GitHub said: “…”".
- agents.page.frame: "Runs aren't listed by agent yet." becomes "Studio can't list runs by agent
  yet.", with **Open the Runs page ›** as before.
- inbox.approval-card: "… so Studio can't send your answer." becomes "… so Halonic can't send your
  answer.", with **Review** as before.
- inbox.proposal-page: "… so Studio can't change its files." becomes "… so Halonic can't change its
  files."
- runs.run-view.failure-banners: on a phone, a run that can't send to its provider's Base URL says
  "To run it, run this on your computer:" with the same command, `halonic run <workflow>`, and
  **Copy command** that the desktop shows.
- shell.welcome-lite-check: "this window" goes: "Checks what Halonic can …", "Couldn't check: the
  folder isn't there" and "The engine's checks, which can't run from here".
- shell.welcome-sample and shell.welcome-cant-open: "Can't copy the demo to …" becomes "Couldn't
  copy the demo to …".
- studio.engine-service and studio.page-versions: "… so Studio can't read its versions." becomes
  "… so Halonic can't read its versions."

## Why

Halonic is named one way: "Halonic" when the command line can't do it either (E6), "Studio" only
next to the terminal, never "the desktop app" or "this window" (N1). A failed action reads
"Couldn't …" (E5). Text from outside Halonic is never the reason; it goes to **Copy details** (E3).
A phone gives the same command as the desktop, to run on the computer (N4).

## What doesn't change

When each line shows, its buttons, and what the screens do. No test was weakened: each test now
expects the new words, and the action stepper's test also checks that the service's message is
not on the screen and is what **Copy details** copies.

## Covers

- action-steppers.run
- agents.page.frame
- inbox.approval-card
- inbox.proposal-page
- runs.run-view.failure-banners
- shell.welcome-cant-open
- shell.welcome-lite-check
- shell.welcome-sample
- studio.engine-service
- studio.page-versions
- apps/studio/src/engine/page-versions.test.ts
- packages/studio/features/action-steppers/src/ui/action-stepper-run.test.tsx
- packages/studio/features/agents/src/page/agent-page.test.tsx
- packages/studio/features/check-computer/src/lines/check-lines.words.test.ts
- packages/studio/features/first-run/src/pick-model/pick-model-words.test.ts
- packages/studio/features/inbox/src/ui/approval-card-changes.test.tsx
- packages/studio/features/inbox/src/ui/approval-card-refusals.test.tsx
- packages/studio/features/inbox/src/ui/proposal-failed.test.tsx
- packages/studio/features/inbox/src/ui/wait-card-refusals.test.tsx
- packages/studio/features/inbox/src/ui/workspace-trust.test.tsx
- packages/studio/features/runs/src/run-view/harness-key-banners.test.ts
- packages/studio/features/workspace/src/sample/try-sample.test.tsx
- packages/studio/shell/src/welcome/lite-check-dialog.test.tsx
- packages/studio/shell/src/welcome/welcome-sample.test.tsx
- apps/studio/src/connect/agent-host-tool-lister.test.ts
