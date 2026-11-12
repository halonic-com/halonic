# server.body-limit

- Status: active
- Since: 0.1.0
- Source: HAL-9 plan phase 4; HAL-6 finding 5; build plan on HAL-195 (PR 2)

The server shall answer status 413 with the code `body_too_large` to a request whose body is over `maxBodyBytes`. When `Content-Length` says the body is too large, the server shall refuse it without reading any of it. Otherwise it shall count the bytes while the body streams and, at the first byte over the limit, stop reading and cancel the stream, so a body with no or a false `Content-Length` can't fill memory.

Rationale: the limit has to hold while the body arrives, because the header is written by the caller.

## Examples

- Given `maxBodyBytes` of 1024 and `Content-Length: 2048`, then the answer is 413 and the body stream is never read.
- Given a chunked body with no `Content-Length` that never ends, then the server stops after the first chunk past 1024 bytes and answers 413.
- Given a body of exactly 1024 bytes, then it goes on.
