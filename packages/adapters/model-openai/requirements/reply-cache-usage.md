# model-openai.reply-cache-usage

- Status: active
- Since: 0.1.0
- Source: HAL-5216; the cache token fields of `Usage` (#789); the harness bridge's OpenAI usage (HAL-3229)

The OpenAI-compatible provider shall give `prompt_tokens_details.cached_tokens` as `cacheReadTokens` and leave those tokens out of `inputTokens`, since the API's `prompt_tokens` counts them too. It shall count no more cache reads than `prompt_tokens`, and leave the cache count out when it is zero, missing or not a count.

## Examples

- Given a reply whose usage has 9,040 prompt tokens, 9,000 of them read from the cache,
  when `chat` returns,
  then its usage gives `inputTokens` 40 and `cacheReadTokens` 9,000.
- Given a reply from a server that sends no cache details,
  when `chat` returns,
  then its usage gives `inputTokens` as the API's `prompt_tokens`, and no cache count.
