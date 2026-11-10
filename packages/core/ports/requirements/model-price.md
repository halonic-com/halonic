# ports.model-price

- Status: active
- Since: 0.1.0
- Source: HAL-2285, from the review of halonic-com/halonic#666 (HAL-2108); cache prices from HAL-2688, from the review of halonic-com/halonic#769

The ports package shall have one model price type, `ModelPrice`, and one way to work out what a call costs at it, `priceOf`: the call's input tokens times the input price, plus its output tokens times the output price, plus its tokens read from the prompt cache times the cache read price, plus its tokens written to the prompt cache times the cache write price, divided by a million once, in the workspace's budget currency and not rounded. Where a model has no cache read or cache write price, its cache tokens shall cost the input price, so no call becomes unpriced for want of one. The engine and the bridge shall both price calls with `priceOf`, so the same call at the same price gets exactly the same cost on either path.

## Examples

- Given a price of 3 per million input tokens and 15 per million output tokens,
  when a call with 1,000 input and 200 output tokens is priced,
  then it costs exactly 0.006.
- Given a price of 2 per million input tokens and 8 per million output tokens,
  when a call with 1 input and 3 output tokens is priced,
  then it costs 0.000026, not rounded to a cent.
- Given a price of 3 input, 15 output, 0.3 cache read and 3.75 cache write per million tokens,
  when a call with 100 input, 10,000 cache read and 1,000 cache write tokens is priced,
  then it costs exactly 0.00705.
- Given a price of 3 per million input tokens and 15 per million output tokens and no cache prices,
  when a call with 100 input, 10 output, 900 cache read and 1,000 cache write tokens is priced,
  then it costs the same as a call with 2,000 input and 10 output tokens.
- Given the same usage and price,
  when the engine and the bridge each work out a call's cost,
  then both get exactly the same number.
