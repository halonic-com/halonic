# Decision: the bridge counts Anthropic's prompt cache tokens apart from input

- Approval: [HAL-2688](/HAL/issues/HAL-2688)
- Kind: internal

`harness-bridge.spend` said that the tokens an Anthropic call reads from or
writes to the prompt cache count as input tokens, because `Usage` had no
field for them. HAL-2688-01 and -02 added those fields and their prices, and
the Anthropic model adapter in `integrations` fills them since
halonic-com/integrations#157. Until the bridge does the same, a Claude Code
run's spend counts every cache read at the full input price, which is 10 to
40 times what Anthropic charges for it, and budgets stop runs too early.

What changes:

- The bridge's Anthropic reader puts cache reads in `cacheReadTokens` and
  cache writes in `cacheWriteTokens` (5 minutes) and `cacheWrite1hTokens`
  (1 hour), as `usage.cache_creation` splits them. Without that split,
  every write counts as a 5-minute write. `inputTokens` keeps only
  Anthropic's `input_tokens`. A cache count that is 0 is left out.
- `bridgeCallCharge` already prices each count at its own price, so its cost
  falls for a call that uses the cache.

The first example of `harness-bridge.spend` changes its result: the stream
now records 100 input tokens with 20 cache read and 5 cache write tokens,
instead of 125 input tokens, and its cost uses the cache prices the example
now gives. Two examples are added, for the 5-minute and 1-hour split and for
a reply without it. Nothing else is removed.

Risk: none for a model without cache prices. Its cache tokens cost the input
price, as before, so its cost stays the same.

## Covers

- harness-bridge.spend
