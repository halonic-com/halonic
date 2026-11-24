# Decision: Continue and Try again wait while the engine isn't answering, and the line follows where the Studio runs

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17334 (Liam's review of halonic#5614 on HAL-16797 asked for it; states D5 and D6 in HAL-5896)
- Kind: user-visible

`assistant.chat.engine-not-answering` said Continue and Try again "shall not be offered" while the
engine isn't answering. States D5 and D6 say an action that needs the engine waits, with the line
as its visible reason, instead of going away (accessibility pass A1: never a dead or vanishing
button). Liam asked for this in his review of #5614. The requirement now says Send, Continue and
Try again wait with the line as their reason, and work again when the engine answers.

It also gains the served and phone forms of the line from states H15 and microcopy 14.1 and 14.3:
"Halonic on the server isn't answering. The reply carries on there, and shows here when it's
back." and the same with "on your computer". The desktop app's line is unchanged. No test was
weakened: the existing examples still hold, and two are added.

## Covers

- assistant.chat.engine-not-answering
