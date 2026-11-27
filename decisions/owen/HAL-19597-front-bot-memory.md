# Decision: the front bot's first reply reads the 10 comments before the message

- Approval: Julian asked for this change in review on HAL-20457 and approves this note there
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:R4WGKmnH0/v0Tje4w3EVyMU3EmT7ysIhj02mwYodQtjX5a3WY4z53cXI8azw+rUETsDtG6ExfoU0Sivns7dCBw==

## What changes

`paperclip.front-bot-first-reply` sends at most the 10 comments before the message to Haiku, instead of 5. Nothing else in the rule changes: the same comments are left out (the bot's own and any shaped like a key), and each is still quoted as data.

## Why

The board asked on HAL-10 for the front bot to have memory, as long as it stays quick (HAL-19597). Reading the last 10 comments of the chat is the first part of that. The code in #6517 already sends 10; the requirement still said 5, which Julian flagged in review.

## Covers

- paperclip.front-bot-first-reply
