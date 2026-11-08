# integration-kit.request-limits

- Status: active
- Since: 0.1.0
- Source: HAL-135 (Ravi's input on HAL-99 and his review of #86)

The limited client shall give every request a timeout for its response headers (redirects included), an idle timeout between pieces of the body while the integration waits for them, an overall timeout and a response size limit, and shall honor the caller's abort signal.

## Examples

- Given a response that declares, or grows to, more bytes than the limit,
  when it is read,
  then it fails with `response-too-large`.
- Given an aborted signal, or a transport slower than the headers or the overall timeout,
  when the integration sends a request,
  then it rejects with a `TimeoutError`, even if the transport ignores the signal.
- Given a body that keeps arriving in pieces,
  when it takes longer than the headers timeout but no gap is longer than the idle timeout,
  then the integration reads all of it.
- Given a body that stops arriving,
  when the integration waits longer than the idle timeout,
  then reading fails with a `TimeoutError`; time the integration spends between reads doesn't count.
