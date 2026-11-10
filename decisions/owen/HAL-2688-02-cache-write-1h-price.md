# Decision: 1-hour prompt cache writes get their own count and price

- Approval: [HAL-2688](/HAL/issues/HAL-2688)
- Kind: public interface (`core/ports`, `core/events`, `core/format`)

Anthropic keeps a prompt cache entry for 5 minutes or for 1 hour. A 5-minute
write costs 1.25 times the input price, a 1-hour write 2 times. HAL-2688-01
gave cache writes one price, which fits only the 5-minute writes, so a call
with 1-hour writes would cost too little. Liam asked for the 1-hour writes to
be priced correctly in the fact-check on HAL-2722.

What changes:

- `Usage` (events) gains an optional `cacheWrite1hTokens`. `cacheWriteTokens`
  now means the writes for the cache's short lifetime (Anthropic: 5 minutes).
  Older run logs have no 1-hour count and read as before.
- `ModelPrice` (ports) and the `models.yaml` price gain an optional
  `cacheWrite1h` price per million tokens.
- `priceOf` prices 1-hour writes at `cacheWrite1h`. Without it they cost
  `cacheWrite`, and without that the input price, so nothing becomes unpriced.
- A run's summary adds up the 1-hour writes apart from the short ones.

Why a second count and price, and not 1-hour tokens scaled up before pricing:
`Usage` is the token record that run logs and summaries show, so scaling would
make those counts wrong. And the 2 times ratio would sit in adapter code
instead of in `models.yaml` with the other prices.

Risk: the fallback charges too little for a model that has 1-hour writes but
no `cacheWrite1h` price (1.25 or 1 times the input price instead of 2). Today
no `models.yaml` we ship gives an Anthropic price, so nothing is affected. When
one does, it gives all three cache prices, with a test that checks it.

The Anthropic readers fill the new count in later changes: the model adapter
in `integrations`, and the bridge's `anthropic-reply.ts` once
halonic-com/halonic#769 merges. Both take the split from the response's
`usage.cache_creation` block and count all writes as 5-minute writes when that
block is missing.

Nothing is removed, and no example changes its result: each requirement
gains a sentence or a name and examples.

## Covers

- ports.model-price
- events.summary-cost
- events.run-log-contract
- format.models-file
