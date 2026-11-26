# Decision: the front bot's credential request check names more verbs and identifiers

- Task: HAL-19215
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19215 (Julian's security re-review of #6351 on HAL-19163 asked for these two fixes, and his review of #6375 on HAL-19215, 26 Nov 05:47 UTC, point 2, asked for the requirement to name them)
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:5nJzk3OQpkxTKX5e9T0hzHD+OSkITitkvAZXnLCzIW2enXyfsPxosuO12wCWSszz6XDAGEcSynfuMt2LO/v0Ag==

## What changes

`paperclip.front-bot-grounding` widens what counts as a credential request
(`credential_request`). A reply is now also rejected when it:

- asks the reader to post, type, give or upload something, besides paste, send,
  share, provide or enter;
- names an identifier that ends in key, token, secret or password, such as
  `PAPERCLIP_API_KEY` or `deploy-token`.

The requirement's other reasons and their tests are unchanged. New must-fail
cases cover both widenings, including one identifier with no hand-over word.
No test is skipped or deleted, and no requirement is retired.

## Why

An injected earlier comment could make the bot ask the board for a key with
"post it here" or by naming the key's identifier, and both passed the check
(Julian ran them on `5ba1ef3`). The requirement says what the check rejects,
so it names the new words too.

## Covers

- paperclip.front-bot-grounding
