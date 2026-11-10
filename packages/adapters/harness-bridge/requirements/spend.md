# harness-bridge.spend

- Status: active
- Since: 0.1.0
- Source: HAL-194 (build plan B3, decision 5); HAL-2553; `HarnessBridgeServer` port v1

When the Node bridge passes a model request on to a provider, it shall record `llm.request` through the run's recorder before the call goes out, with the agent, the provider, the model the request names and its number of messages. When the reply has ended, or was cut short, and it gave the call's usage, the bridge shall record `llm.response` with that usage, the time the call took, the answer's text, and the cost and payer from `bridgeCallCharge`; a model without a price gets no cost. For Anthropic, the usage comes from a JSON reply's `usage`, or from a stream's `message_start` and `message_delta` events, where a later count replaces an earlier one, and the tokens read from or written to the prompt cache count as input tokens. A reply whose status isn't 200 records no `llm.response`. A request that names no model shall be refused with `invalid_input` without calling the provider or recording anything.

## Examples

- Given a stream whose `message_start` says 100 input tokens, 5 written to and 20 read from the cache, and whose `message_delta` says 42 output tokens, at a price of 3 and 15 per million,
  when the stream ends,
  then the bridge records 125 input tokens, 42 output tokens and a cost of 0.001005.
- Given a stream cut short after `message_start`,
  when the program goes away,
  then the bridge records the input tokens `message_start` gave.
- Given an error reply from the provider,
  when it has been passed back,
  then only `llm.request` is recorded.
