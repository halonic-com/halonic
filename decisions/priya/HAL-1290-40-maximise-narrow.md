# Decision: a tab too narrow for the panel ends maximise

- Approval: the maintainer approves this change in review of HAL-1290 (13d 2b follow-up, from HAL-4976)
- Kind: internal

`shell.panel-maximise` gains one sentence and one example; nothing it promised before is taken
away, and no test was weakened.

Liam's review of #1610 (HAL-4976) found that a maximised panel came back maximised after its tab
went too narrow for the panel and was widened again, and the requirement didn't say whether it
should. It now ends maximise. A narrow tab changes the whole layout, the panel turns into a button
beside the chat, and when the tab widens again the user expects the page as it normally is: the
chat beside the panel. A panel that came back over the chat, with the chat dimmed and inert, would
hide what the user was just looking at.

## Covers

- shell.panel-maximise
