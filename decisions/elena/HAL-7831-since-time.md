# Decision: the refused-since time reads the way the Inbox shows times

- Approval: the wording is the Inbox's settled rule, set on [HAL-7831](/HAL/issues/HAL-7831) by Liam; Liam approves this note in review
- Kind: internal

## What changes

The Google setup source's "Needs sign-in since …" line now uses the Inbox's `clockTime` rule: "10:42" today, "Sat 10:42" within 6 days, else "Fri 6 Nov, 10:42". The requirement's example changes with it (a 9-day-old refusal), and the two test files that check the line now pass a `now` and cover today, 3, 5, 6 and 9 days ago.

## Why

Google refuses a refresh token after 7 days for an app in testing mode, so the usual refusal is days old. "since 02:10" alone read as today. One time rule across Studio keeps the Inbox and the setup source saying the same thing.

No test was weakened: the old clock-only cases stay as the "today" case.

## Covers

- google-setup.setup-source
- packages/studio/features/google-setup/src/google-setup-source.test.ts
- packages/studio/features/google-setup/src/setup-entry.test.ts
