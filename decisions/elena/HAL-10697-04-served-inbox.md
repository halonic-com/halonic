# Decision: a served window has an Inbox that lists only the Google setup

- Task: HAL-10697
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10697 (team decision, no board card; Sofia's UX check on HAL-10741 and HAL-10747: no new screen, two added lines)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ut5ZAL1w82m0SwWAbynmoURnzuWg9O5CIrps6UR9iPaq7z+CyMBK1JlHFl/q7NqVgSR2rNfG2xNfzwBGlHP5Cg==

## What changes

A served Studio window gets an Inbox that lists only the Google setup (no runs, no Library connector page). Opening a setup shows the read-only layout with step 7's text and a Copy button for the `halonic google sign-in` command. The window reads the setups again when it regains focus.

The requirement `studio.served-google-setup-accounts` changes. The `studio.entry` test of the served services now passes the page's window, which `servedServices` needs. No test was weakened or skipped.

## Why

A served window could not reach Google setup step 7 at all (HAL-10697).

## Covers

- studio.served-google-setup-accounts
