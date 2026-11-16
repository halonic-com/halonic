# services.agent-host-transport

- Status: active
- Since: 0.1.0
- Source: HAL-4878 (part 6, and L4 of Julian's review on HAL-4915)

While the Studio runs in the desktop shell, it shall reach the agent host only through the shell's `agent_host_request`, `agent_host_stream` and `agent_host_stream_end` commands, as an `AgentHostTransport`, so the launch token stays in the shell. A refusal from the shell shall be an `AgentHostError` with status `0` and the shell's kind; the host's own refusals stay answers. Each stream shall have its own id on the page. Its lines shall end when the shell sends `end`, throw when it sends `failed`, and end and hang up when the caller aborts, stops reading, or the shell sends something that isn't a stream message. Outside the shell there shall be no transport.

## Examples

- Given a page in the shell,
  when the engine calls `GET /v1/health`,
  then the shell gets `agent_host_request` with that route, and the engine gets the host's status and body.
- Given the shell refuses a call with `host_unavailable`,
  when the engine calls a route,
  then it gets an `AgentHostError` with status `0` and kind `host_unavailable`.
- Given an open stream,
  when the shell sends two lines and `end`,
  then the engine reads both lines and the stream ends.
- Given an open stream,
  when the caller aborts,
  then the lines end and the shell gets `agent_host_stream_end` with the stream's id.
- Given a page opened in a browser,
  when the Studio looks for the agent host transport,
  then it finds none.
