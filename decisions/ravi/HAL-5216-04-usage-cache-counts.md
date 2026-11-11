# Decision: the Anthropic provider counts 1-hour cache writes apart from 5-minute ones

- Approval: the review follow-ups on [HAL-5216](/HAL/issues/HAL-5216) asked for it; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:SuOZmNQn+X8Q7Z136QxeeatRWjRgH0B7P+M80PXgIkkHlle/wFDnG7vo8R5MOl8MTZNQpLP6+i1phCKQ2fAeDw==
- Task: HAL-5216

## What changes

`model-anthropic.reply-cache-usage` now splits the cache writes by the API's `cache_creation`
breakdown: 5-minute writes stay `cacheWriteTokens`, and 1-hour writes become `cacheWrite1hTokens`.
Without the breakdown, all of `cache_creation_input_tokens` still counts as 5-minute writes, as
before. One example is added. No example was removed or weakened.

## Why

1-hour writes cost more than 5-minute ones, and `Usage` already has `cacheWrite1hTokens` for them.
The harness bridge already splits them this way, so the model adapter now agrees with it, and
cost and budget figures are right for calls that use the 1-hour cache.

## Covers

- model-anthropic.reply-cache-usage
