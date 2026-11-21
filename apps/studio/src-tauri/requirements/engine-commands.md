# studio.src-tauri.engine-commands

- Status: draft
- Since: unreleased
- Source: HAL-14219; design note D3 and D6 of HAL-14206, security review on HAL-14212

When the page calls an `engine_*` command, the shell shall call the engine that runs the page's window's workspace, and only for a route of the shell's table, named as `"<METHOD> <path>"` with each param as `{name}`, such as `"POST /api/runs/{run}/events"`; it shall refuse any other name as `unknown_route`. The page shall send the route's params apart, never in the name: `run` (a run's id: not empty, at most 256 bytes, no `/`, not `.` or `..`, sent percent-encoded as one path segment), `after` (a whole number from 0 up), `hub` (`@workspace`, or an id by the workspace format's rule for a hub's id) and `routine` (an id by the workspace format's rule for a routine's id). The shell shall refuse a param that is missing, invalid, or that the route doesn't take, as `bad_param` naming the param, before it sends anything, and no refusal shall repeat a value the page sent. While the shell knows no engine for the window, it shall refuse every call as `engine_unavailable`. It shall make each call itself, to the address of the engine's checked handshake only, with no proxy, no redirect followed and the launch token, which never reaches the page. It shall answer a JSON route with the engine's status and body, and refuse an answer that is cut off, over 16 MiB or not JSON as `io`; a JSON route that hasn't answered within 120 s is refused as `engine_unavailable`. A POST without a body, or with `null`, sends `{}`; a GET given a body, and a body over 1 MiB, are refused as `bad_body`. The page shall name each stream it opens with an id of its own; the shell shall refuse an id the page already uses as `stream_in_use`, and a 17th open stream of one page as `too_many_streams`. For a stream route, it shall send each server-sent event to the page's channel as its name, its data as text and its id, then `end`, or `failed` when the stream broke off or an event is over 1 MiB; when the engine refuses the stream, it shall answer the engine's status and body instead. When the page ends a stream, even before the engine has answered, when the page reloads or its window closes, and when the shell forgets the window's engine, the shell shall hang up on the engine. Only the app's own main window shall be granted the commands; the Studio the computer serves shall get none.

## Examples

- Given a window with no engine,
  when the page calls `engine_request` for `GET /api/hello`,
  then the shell refuses it as `engine_unavailable`.
- Given the page names `"POST /api/runs/{run}/cancel"` with `{ "run": ".." }`,
  when it calls `engine_request`,
  then the shell refuses it as `bad_param` with `param` `run`, its message doesn't hold `..`, and the engine sees no request.
- Given the engine answers a route with a redirect to another address,
  when the page calls it,
  then the shell answers the redirect's status and sends nothing to the other address.
- Given a page with 16 engine streams open,
  when it opens another,
  then the shell refuses it as `too_many_streams`.
- Given a page with the run updates open,
  when the page reloads,
  then the shell hangs up on the engine.
