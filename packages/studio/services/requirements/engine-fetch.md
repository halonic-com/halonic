# services.engine-fetch

- Status: active
- Since: unreleased
- Source: HAL-14861 (B1 step 4 PR 2, plan on HAL-14219); `apps/studio/src-tauri/requirements/engine-commands.md`

While the Studio runs in the desktop shell, it shall reach the window's engine only through the shell's `engine_request`, `engine_stream` and `engine_stream_end` commands, as a `fetch` that takes requests on `http://engine.invalid`: each request shall go to the shell as the name of the route of the shell's table it calls and the params its path and query hold, never as a URL, so the engine's address and token stay in the shell. A request to any other address or route shall fail without calling the shell. The engine's answers, its refusals included, shall be responses with the engine's status and JSON body; a stream route's answer shall be a body of server-sent events, each with the id, event name and data the shell sent, which ends when the shell sends `end`, fails when it sends `failed`, and ends and calls `engine_stream_end` when the request is aborted, the reader cancels it, or the shell sends something that isn't a stream message. A refusal from the shell shall fail the request as an `EngineCallRefused` with the shell's kind, such as `engine_unavailable`. The routes it takes shall be exactly the shell's table, with the same answer kind.

## Examples

- Given a page in the shell,
  when the executor posts to `http://engine.invalid/api/runs/run%2001/events`,
  then the shell gets `engine_request` with route `POST /api/runs/{run}/events`, params `{ run: "run 01" }` and the body, and the executor gets the engine's status and body.
- Given an open run stream,
  when the shell sends an event with id `3` and then `end`,
  then the body reads `id: 3`, the event's name and its data, and ends.
- Given an open run stream,
  when the request is aborted,
  then the body fails and the shell gets `engine_stream_end` with the stream's id.
- Given no engine runs for the window's workspace,
  when the page calls a route,
  then the request fails as an `EngineCallRefused` of kind `engine_unavailable`.
- Given a request to `https://example.com/api/runs`,
  when the page sends it,
  then it fails as `unknown_route` and the shell gets no call.
