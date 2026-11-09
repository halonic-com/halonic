# contracts.llm-provider

- Status: active
- Since: 0.1.0
- Source: HAL-181; `LlmProvider` port v1

Where an adapter implements `LlmProvider`, it shall have `stream()` exactly when `capabilities.streaming` is true. `chat` shall answer with the text, tool calls (each with its id, name and parsed arguments, in order), usage and finish reason the model gave, and shall leave the request as it was. Where the binding says the vendor gives a summary of the model's reasoning, `chat` shall give that summary too. Any `replay` it adds shall survive a JSON round trip. `chat` shall reject when the vendor refuses the call, reject an already aborted call without reaching the vendor, and reject and close the call when its signal aborts during it. The suite runs against scripted or recorded vendor replies, never a real vendor.

## Examples

- Given the model answers with two tool calls,
  when `chat` is called,
  then the response holds both calls in order, with their ids, names and arguments as objects.
- Given a request whose signal is already aborted,
  when `chat` is called,
  then it rejects and no call reaches the vendor.
- Given the model is still answering,
  when the request's signal aborts,
  then `chat` rejects and no call is left open.
