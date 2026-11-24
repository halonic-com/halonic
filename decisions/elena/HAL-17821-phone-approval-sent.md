# Decision: on a phone, an approve the run goes on from says "Approval sent."

- Task: HAL-17821
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17820 (option A, "Approval sent.", decided by Chief with Nina on 24 Nov as a team decision under HAL-2282, a detail of the approved phone Inbox; HAL-12744 ships the phone Inbox in 0.1.x without Notices)
- Kind: user-visible

## What changes

`inbox.approval-card` and `inbox.wait-card` each get one sentence: on a phone, the approve line
that says the run continues ends "Approval sent." instead of "The run continues.", as the new
requirement `inbox.approval-phone` says. On the approval card, "Approved by you at 10:44. Approval
sent."; on a wait step labelled "Send reply", "You chose Send reply at 10:44. Approval sent.". The
computer's lines, "The run finished." on a phone, the reject lines and every example stay as they
are. Each requirement's Source names HAL-17820.

## Why

The phone Inbox ships without Notices (HAL-12744), so after "The run continues." a run that then
stops at its month's budget leaves the phone with a promise it can't explain. "Approval sent." says
only what the phone knows.

## Covers

- inbox.approval-card
- inbox.wait-card
