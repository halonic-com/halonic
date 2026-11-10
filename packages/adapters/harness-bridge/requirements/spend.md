# harness-bridge.spend

- Status: active
- Since: 0.1.0
- Source: HAL-194 (build plan B3 and B4, decision 5); HAL-2553; HAL-2688; HAL-3218; HAL-3229; `HarnessBridgeServer` port v1

When the Node bridge passes a model request on to a provider, it shall record `llm.request` through the run's recorder before the call goes out, with the agent, the provider, the model the request names and its number of messages. When the reply has ended, or was cut short, and it gave the call's usage, the bridge shall record `llm.response` with that usage, the time the call took, the answer's text, and the cost and payer from `bridgeCallCharge`; a model without a price gets no cost. For Anthropic, the usage comes from a JSON reply's `usage`, or from a stream's `message_start` and `message_delta` events, where a later count replaces an earlier one. The tokens read from the prompt cache count as cache reads, not input. The tokens written to it count as 5-minute or 1-hour cache writes, as the reply's `usage.cache_creation` splits them; without that split, every write counts as a 5-minute write. For OpenAI, the usage comes from a JSON reply's `usage`, or from the response a stream's `response.completed`, `response.incomplete` or `response.failed` event carries, and a stream cut short before that event gave no usage. The tokens `usage.input_tokens_details.cached_tokens` gives were read from the prompt cache: they count as cache reads and are taken out of `input_tokens`, which includes them; `output_tokens` is taken as it is. A cache count that is 0 is left out. The number of messages is the length of OpenAI's `input`, or one when `input` is text. A reply whose status isn't 200 records no `llm.response`. A request that names no model shall be refused with `invalid_input` without calling the provider or recording anything.

## Examples

- Given a stream whose `message_start` says 100 input tokens, 5 written to and 20 read from the cache, and whose `message_delta` says 42 output tokens, at a price per million of 3 for input, 15 for output, 0.15 for cache reads and 3.75 for cache writes,
  when the stream ends,
  then the bridge records 100 input tokens, 42 output tokens, 20 cache read tokens, 5 cache write tokens and a cost of 0.00095175.
- Given a reply whose `usage.cache_creation` says 100 tokens written for 5 minutes and 200 for 1 hour,
  when it has been passed back,
  then the bridge records 100 cache write tokens and 200 1-hour cache write tokens.
- Given a reply with 300 tokens written to the cache and no `usage.cache_creation`,
  when it has been passed back,
  then the bridge records 300 cache write tokens.
- Given a stream cut short after `message_start`,
  when the program goes away,
  then the bridge records the input tokens `message_start` gave.
- Given an error reply from the provider,
  when it has been passed back,
  then only `llm.request` is recorded.
- Given an OpenAI stream whose `response.completed` says 100 input tokens, 20 of them cached, and 42 output tokens, at a price per million of 1.25 for input, 10 for output and 0.125 for cache reads,
  when the stream ends,
  then the bridge records 80 input tokens, 42 output tokens, 20 cache read tokens and a cost of 0.0005225.
- Given an OpenAI stream cut short before `response.completed`,
  when the bridge closes,
  then only `llm.request` is recorded.
