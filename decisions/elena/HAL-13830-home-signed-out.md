# Decision: Home's Needs you says to sign in again

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13830 (HM1, decided by the team; confirmed in the C255 check on HAL-13849)
- Kind: user-visible

## What changes

- `inbox.home`: a later failed load still keeps the rows as they were. When it failed because the
  served Studio's sign-in ended, Needs you now also shows the Inbox list's line over its rows, "Sign
  in again to list what waits for you.", in a polite status that is there before the line, so a
  screen reader reads it once, as the Inbox's line does (HAL-13801 SO2). Any other failure still
  shows no line.

## Why

After `halonic secret set serve-password` ended every sign-in, an open Home kept "Needs you · 7
waiting" and its rows, asked again every few seconds, got 401 each time and never said so, while the
Inbox in the same tab said to sign in again. Every old example still holds and one is added. The
only changed test adds a check that the status stays empty when a later load fails for another
reason. No test was weakened.

## Covers

- inbox.home
