# Decision: the bridge counts OpenAI's cached tokens as cache reads

- Approval: HAL-3229
- Kind: internal

Since HAL-2688, the bridge counts the tokens an Anthropic call reads from the
prompt cache apart from its input, and spend prices them at the cache read
price. The OpenAI reader added in HAL-3218 didn't: OpenAI's `input_tokens`
includes the cached tokens, which `input_tokens_details.cached_tokens` gives,
so a Codex run's cache hits were priced at the full input rate.

What changes:

- The bridge's OpenAI reader takes the cached tokens out of `input_tokens`
  and puts them in `cacheReadTokens`. A count of 0 is left out, as for
  Anthropic. A cached count larger than the input counts as the whole input,
  so the input never goes below 0.
- `harness-bridge.spend` says that OpenAI's cached tokens count as cache
  reads and are taken out of `input_tokens`, instead of taking
  `input_tokens` as it is. The OpenAI stream example changes its result: its
  100 input tokens now have 20 cached, so it records 80 input tokens and 20
  cache read tokens, and its cost uses the cache read price the example now
  gives. Nothing is removed.

Risk: none for a model without a cache read price. Its cache reads cost the
input price, as before, so its cost stays the same.

## Covers

- harness-bridge.spend
