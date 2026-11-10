# format.models-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`; cache prices, 1-hour cache writes included, from HAL-2688

When `parseFile` reads `models.yaml`, the format shall accept the old `Models` schema: each alias needs a provider id and a model, gets `params: {}` and `fallback: []` by default, and keeps the old ranges for tuning (temperature 0–2, topP 0–1) and prices (0 or more). A price may also give optional `cacheRead`, `cacheWrite` and `cacheWrite1h` prices for prompt cache tokens, 0 or more.

## Examples

- Given alias `fast` with only a provider and a model, when it is parsed, then it has `params: {}` and `fallback: []`.
- Given a price of `{ input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75, cacheWrite1h: 6 }`, when it is parsed, then it keeps all five prices.
- Given `temperature: 3` and a price input of -1, when it is parsed, then it fails with `too_big` and `too_small` at their paths and lines.
- Given a file that is a list, when it is parsed, then it fails with `invalid_type` at the root, line 1.
