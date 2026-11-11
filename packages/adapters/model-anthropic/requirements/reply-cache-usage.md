# model-anthropic.reply-cache-usage

- Status: active
- Since: 0.1.0
- Source: HAL-2921; the cache token fields of `Usage` (#789); HAL-5216

The Anthropic provider shall give `cache_read_input_tokens` as `cacheReadTokens`, and the cache writes as `cacheWriteTokens` (5 minutes) and `cacheWrite1hTokens` (1 hour), apart from `inputTokens`, since the API's `input_tokens` already leaves them out. It shall split the writes by `cache_creation.ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens`, and count all of `cache_creation_input_tokens` as 5-minute writes when the reply has no such split. It shall leave a cache count out when it is zero, missing or not a count.

## Examples

- Given a reply whose usage reads 9,000 tokens from the cache and writes 1,200 to it,
  when `chat` returns,
  then its usage gives `cacheReadTokens` 9,000 and `cacheWriteTokens` 1,200, and `inputTokens` stays the API's `input_tokens`.
- Given a reply whose usage has no cache counts, or zero,
  when `chat` returns,
  then its usage has no cache counts.
- Given a reply whose usage writes 200 tokens to the cache for 5 minutes and 1,000 for 1 hour,
  when `chat` returns,
  then its usage gives `cacheWriteTokens` 200 and `cacheWrite1hTokens` 1,000.
