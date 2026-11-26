# Decision: the Send feedback window stays open when its crop can't be loaded

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19511 (fallback states on an approved window are the team's call, HAL-2282; design on HAL-19384, words approved on HAL-19391)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:IyoBIwxUgjW8KXqkN3Olq9QMgo6ctIIl9Uwx8Q6AWM6VEfE0s39eXW+KZ8HCwj4YtB9aTdJgzwBIe61NEhXRDg==
- Task: HAL-19511

## What changes

`feedback.send-window` said that when the crop is gone the window calls `plugin:feedback|end`
and hands on nothing. Now a crop that can't be loaded keeps the window open: it says "Couldn't
load the screenshot." and offers "Send without a screenshot", as the new requirement
`feedback.send-states` says. Its test "ends when the crop is gone" moves to that requirement as
"says the crop couldn't be loaded, stays open and sends the text alone", so `feedback.send-window`
runs one test fewer. The requirement also says the window ends once the feedback is taken, since
a refused feedback now keeps the window open with "Try again".

## Why

Noah's design on HAL-19384 replaces the silent close: closing threw away what the person had
typed, while the text alone is still worth sending. These are fallback states on a window the
team already approved, so the team decides them (HAL-2282).

## Covers

- feedback.send-window
