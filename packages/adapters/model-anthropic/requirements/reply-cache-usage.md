# model-anthropic.reply-cache-usage

- Status: active
- Since: 0.1.0
- Source: HAL-2921; the cache token fields of `Usage` (#789)

The Anthropic provider shall give `cache_read_input_tokens` as `cacheReadTokens` and `cache_creation_input_tokens` as `cacheWriteTokens`, apart from `inputTokens`, since the API's `input_tokens` already leaves them out. It shall leave a cache count out when it is zero, missing or not a count.

## Examples

- Given a reply whose usage reads 9,000 tokens from the cache and writes 1,200 to it,
  when `chat` returns,
  then its usage gives `cacheReadTokens` 9,000 and `cacheWriteTokens` 1,200, and `inputTokens` stays the API's `input_tokens`.
- Given a reply whose usage has no cache counts, or zero,
  when `chat` returns,
  then its usage has no cache counts.
