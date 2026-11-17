# sign-in-loopback.loopback-server

- Status: active
- Since: unreleased
- Source: HAL-11618 (HAL-8613, HAL-984 design, section 4)

The loopback server shall listen on `127.0.0.1` and a port the system picks, hand each request to the flow's `Request → Response` handler, and refuse with a 421, before the handler sees it, a request whose `Host` is not the loopback address and this port. A handler that throws shall give an empty 500, and closing shall let an answer in flight finish.

## Examples

- Given a handler and a request to `127.0.0.1` on the server's port,
  then the handler gets the method, path and query, and its status, headers and body come back.
- Given a request whose `Host` is another name or another port,
  then the answer is 421 and the handler isn't called.
- Given a handler that throws an error with a token in its message,
  then the answer is an empty 500.
- Given a close while an answer is in flight,
  then the answer arrives, and a second close does nothing.
