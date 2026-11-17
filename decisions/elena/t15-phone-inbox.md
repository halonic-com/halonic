# Decision: the Inbox's request form gets a phone sheet

- Approval: the phone request sheet is in the board-approved first-run flow (flow-first-run rev 15, HAL-663, sections 7.2); Liam approved the T15 plan that builds it on HAL-10917
- Kind: user-visible
- Signature: unsigned

The requirement said a phone shows no form until its request sheet lands. It now says what the sheet is: a New request
row at the top of the phone's list opens a form sheet with Message focused, Send at the bottom, the same empty-message
and "Not started" lines as on a computer, and it closes once the run has started. Nothing else in the requirement
changes, and no test was weakened.

## Covers

- inbox.request
