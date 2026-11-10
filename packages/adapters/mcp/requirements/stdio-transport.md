# mcp.stdio-transport

- Status: active
- Since: 0.1.0
- Source: HAL-230 (Liam's approval, changes 2 to 4, 10 Nov 2026); HAL-4564 (the last lines of standard error kept for the stopped report); MCP 2025-11-25, stdio transport

The stdio transport shall send each MCP message as one line on the program's standard input and read one message per line from its standard output, routing each answer to the request with its id, whatever the order. It shall give the server's own requests and notifications to the oldest waiting request, and while no request waits it shall answer `ping`, refuse every other request with "method not found" and drop notifications. When the caller cancels a waiting request it shall fail that request alone, keeping the session and the program. It shall read the program's standard error to its end, parsing none of it and keeping only its last 10 lines, each cut at 300 characters, in memory, for the connector to report once the program has stopped (`mcp.stdio-restart`). It shall end the session, fail every waiting request with a typed error and stop the program when a line is longer than the message limit, a line isn't JSON, a request (`initialize` included) isn't answered within the request timeout, the program's output ends, or the transport is closed. To stop the program it shall close the program's input, wait, ask the program and everything it started to end, wait, and then force them.

## Examples

- Given a program that sends a line longer than the message limit while `tools/list` waits,
  when the line arrives,
  then `tools/list` fails as `unexpected-response` and the program is stopped.
- Given a program that never answers `initialize`,
  when the request timeout passes,
  then `initialize` fails saying the program didn't answer in time, and the program is stopped.
- Given a `tools/call` that waits for its answer,
  when the caller cancels it,
  then the call fails, the server is told it was cancelled, and the next request still works.
- Given a `tools/call` that waits for its answer,
  when the transport is closed,
  then the call fails instead of waiting for ever.
- Given a program that ignores its input closing and SIGTERM,
  when the transport is closed,
  then the program is forced to end after the second wait.
