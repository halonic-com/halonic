# Decision: served Home says to sign in again, served answers name their wait step

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13830 (HM1, decided by the team and confirmed in the C255 check on HAL-13849; OH1 from the C415 check and NM1 from the C422 check, decided by the team)
- Kind: user-visible

## What changes

- `inbox.home`: a later failed load still keeps the rows as they were. When it failed because the
  served Studio's sign-in ended, Needs you now also shows the Inbox list's line over its rows, "Sign
  in again to list what waits for you.", in a polite status that is there before the line, so a
  screen reader reads it once, as the Inbox's line does (HAL-13801 SO2). Any other failure still
  shows no line.
- `studio.served-inbox-runs`: an answer to a wait step also sends `wait`, the step's state and the
  time it started waiting, next to the event, its payload and a tool call's `callId`. The host
  (`server.run-routes`) already checks a `wait` it gets.
- `cli.commands.serve.agent-names`: only the rationale changes. It said a rename shows "at once";
  the names come from the live version, so a rename saved in an agent file shows once a new live
  version holds it. The requirement and its examples stay as they are.

## Why

After `halonic secret set serve-password` ended every sign-in, an open Home kept "Needs you · 7
waiting" and its rows, asked again every few seconds, got 401 each time and never said so, while the
Inbox in the same tab said to sign in again.

The desktop's answer names its wait step, so a late answer is refused and the card says "This is no
longer waiting for you." The served page dropped `wait`, so a card left open on a phone, whose step
was answered elsewhere, could answer the run's next wait step.

Every old example still holds; the new sentences and examples only add to the requirements. The only
changed test adds a check that Home's status stays empty when a later load fails for another reason.
No test was weakened.

## Covers

- inbox.home
- studio.served-inbox-runs
- cli.commands.serve.agent-names
