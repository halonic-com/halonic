# Decision: a served window's Inbox lists the Google setup, read-only

- Task: HAL-10697 (continued on HAL-13322)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10697 (team decision, no board card; Sofia's UX check on HAL-10741 and HAL-10747: no new screen, two added lines)
- Kind: user-visible

## What changes

A served Studio window's Inbox now lists the Google setup next to the waiting runs. The window has no Library connector page, so the setup has no badges or connector block there. Opening a setup shows the read-only layout with step 7's text and a Copy button for the `halonic google sign-in` command. The window reads the setups again when it regains focus.

The requirement `studio.served-google-setup-accounts` changes: it now also says what the served Inbox shows of the setup. No test was weakened or skipped.

## Why

A served window could not reach Google setup step 7 at all (HAL-10697).

## Covers

- studio.served-google-setup-accounts
