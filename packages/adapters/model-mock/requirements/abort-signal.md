# model-mock.abort-signal

- Status: active
- Since: 0.1.0
- Source: HAL-3418

When a request's signal has already aborted, the mock model shall reject the call with the signal's reason, without recording the request or using up a scripted reply.

## Examples

- Given the script `{ writer: ["Hello"] }` and an aborted signal,
  when the writer is answered,
  then the call rejects, the model holds no request and the writer still has 1 reply left.
