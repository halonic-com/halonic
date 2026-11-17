# Decision: the Inbox's request form gets a phone sheet

- Approval: the phone request sheet is in the board-approved first-run flow (flow-first-run rev 15, HAL-663, sections 7.2); Liam approved the T15 plan that builds it on HAL-10917
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5Tsi32H11vd1MHlMJHa1vW0/yk0wzDSgFUZBmudVp1kYO8huEDDl2G73rdjHn1ALzwLlhFVOTvwFj6Fxh4JbAQ==

The requirement said a phone shows no form until its request sheet lands. It now says what the sheet is: a New request
row at the top of the phone's list opens a form sheet with Message focused, Send at the bottom, the same empty-message
and "Not started" lines as on a computer, and it stays open once the run has started until the request's card arrives (then it closes and the card opens by itself) or Close is pressed. Nothing else in the requirement
changes, and no test was weakened.

## Covers

- inbox.request
