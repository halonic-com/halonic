# ports.model-price

- Status: active
- Since: 0.1.0
- Source: HAL-2285, from the review of halonic-com/halonic#666 (HAL-2108)

The ports package shall have one model price type, `ModelPrice`, and one way to work out what a call costs at it, `priceOf`: the call's input tokens times the input price plus its output tokens times the output price, divided by a million once, in the workspace's budget currency and not rounded. The engine and the bridge shall both price calls with `priceOf`, so the same call at the same price gets exactly the same cost on either path.

## Examples

- Given a price of 3 per million input tokens and 15 per million output tokens,
  when a call with 1,000 input and 200 output tokens is priced,
  then it costs exactly 0.006.
- Given a price of 2 per million input tokens and 8 per million output tokens,
  when a call with 1 input and 3 output tokens is priced,
  then it costs 0.000026, not rounded to a cent.
- Given the same usage and price,
  when the engine and the bridge each work out a call's cost,
  then both get exactly the same number.
