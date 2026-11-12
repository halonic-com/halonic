# Decision: prompt cache tokens are counted apart and priced at their own rates

- Approval: HAL-2688
- Kind: public interface (`core/ports`, `core/events`, `core/format`)

Anthropic reports the input tokens it read from and wrote to the prompt cache
apart from the rest, and charges them differently. What a cache read costs
depends on the model: 0.1 times the input price on older models, 0.05 times
on Sonnet 5.5 and Opus 5.5, 0.025 times on Fable 5.1 and 5.2. A 5-minute
cache write costs 1.25 times the input price. Counting them as plain input,
as halonic-com/halonic#769 does, overstates a Claude Code run's spend (its
reads by 10 to 40 times), so budgets stop runs too early.
Liam asked for this change in his review of #769 and wrote it up as HAL-2688.

What changes:

- `Usage` (events) gains optional `cacheReadTokens` and `cacheWriteTokens`.
  They are not in `inputTokens`. Older run logs have neither and read as before.
- `ModelPrice` (ports) and the `models.yaml` price gain optional `cacheRead`
  and `cacheWrite` prices per million tokens.
- `priceOf` prices each kind of token at its own price. A model without a
  cache price prices its cache tokens at the input price, so a call that was
  priced before stays priced, and costs what it did.
- A run's summary adds up the cache tokens apart from the input tokens.

Nothing is removed, and no example changes its result: each requirement
gains a sentence and examples. The run log contract's type test now names
the two optional `usage` fields; old logs still match it.

Left for later: Anthropic's 1-hour cache writes cost twice the input price,
not 1.25 times. One `cacheWrite` price covers the 5-minute writes that Claude
Code uses today; HAL-2688-02 adds the 1-hour price. OpenAI counts its cached
tokens inside the prompt tokens; its readers can fill `cacheReadTokens` the
same way in a later change.

## Covers

- ports.model-price
- events.summary-cost
- events.run-log-contract
- format.models-file
