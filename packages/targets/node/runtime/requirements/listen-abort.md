# runtime.listen-abort

- Status: active
- Since: 0.1.0
- Source: HAL-195 (build plan PR 10c, remote run executor); PR 10 plan approved on HAL-9093

The Node listener shall abort the `signal` of the request it hands to the handler when the client closes the connection before the answer is written, and shall leave it alone when the answer was written in full.

Rationale: a chat turn can run for a minute. When the person stops the chat, the host must stop the model call too, or it keeps paying for an answer nobody reads. Only the listener sees the connection close.

## Examples

- Given a handler still working on a request, when the client closes the connection, then the request's `signal` is aborted.
- Given a handler that answered in full, then the request's `signal` is not aborted.
