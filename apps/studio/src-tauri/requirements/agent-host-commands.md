# studio.src-tauri.agent-host-commands

- Status: draft
- Since: 0.1.0
- Source: HAL-4878; `apps/agent-host/README.md`; `agentHostRequestRoutes` and `agentHostStreamRoutes` in `packages/adapters/agent-host-client`

When the page calls an `agent_host_*` command, the shell shall call the agent host only for a route of the host's table, named as `"<METHOD> <path>"`, and shall refuse any other name as `unknown_route` before it starts the host. It shall start one host for the CLI's profile on the first call, and a new one when that one has exited. It shall make each call itself, to the host's loopback address only, with no proxy, no redirect and the launch token, which never reaches the page. It shall answer a JSON route with the host's status and body, and refuse an answer that is cut off, over 16 MiB or not JSON as `io`; a JSON route that hasn't answered within 120 s is refused too. A POST without a body, or with `null`, sends `{}`; a GET given a body is refused. The page shall name each stream it opens with an id of its own, and the shell shall refuse an id the page already uses as `stream_in_use`. For a stream route, it shall send each line to the page's channel, then `end`, or `failed` when the stream broke off; when the host refuses the stream, it shall answer the host's status and body instead. When the page ends a stream, even before the host has answered, and when the page reloads or its window closes, the shell shall hang up on the host.

## Examples

- Given the page names `GET http://example.com/`,
  when it calls `agent_host_request`,
  then the shell refuses it as `unknown_route` and starts nothing.
- Given the served Studio,
  when it calls any `agent_host_*` command,
  then the shell refuses it.
- Given a page with a run's stream open,
  when the page reloads,
  then the shell hangs up on the host, which ends the run.
- Given a page that ends a stream before the host has answered,
  when the host answers,
  then the shell hangs up and the page's call is refused as `stream_ended`.
