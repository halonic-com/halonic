# studio.src-tauri.agent-host-commands

- Status: draft
- Since: 0.1.0
- Source: HAL-4878, HAL-6256, HAL-7373; `apps/agent-host/README.md`; `agentHostRequestRoutes` and `agentHostStreamRoutes` in `packages/adapters/agent-host-client`

When the page calls an `agent_host_*` command, the shell shall call the agent host only for a route of the host's table, named as `"<METHOD> <path>"`, and shall refuse any other name as `unknown_route` before it starts the host. It shall start one host for the CLI's profile on the first call, and a new one when that one has exited, and give it as `--sweep-root` the profile folder and each folder the person has open at that moment, without the long-path prefix. It shall start the host the person's sandbox choice asks for: the host in Halonic's WSL distro, relayed, for a saved `srt-wsl`, and on Windows for no saved choice (the default there is `srt-wsl` alone); the local host for any other saved choice. It shall never start the local host in place of the distro: a distro or `wsl.exe` that is missing refuses the call as `host_unavailable` with the `reason` `distro-missing` or `wsl-missing`, and a saved choice that isn't exactly a valid choice, is a link or a folder refuses it as `host_unavailable` naming the file. It shall make each call itself, to the host's loopback address only, with no proxy, no redirect and the launch token, which never reaches the page. It shall answer a JSON route with the host's status and body, and refuse an answer that is cut off, over 16 MiB or not JSON as `io`; a JSON route that hasn't answered within 120 s is refused too. A POST without a body, or with `null`, sends `{}`; a GET given a body is refused. The page shall name each stream it opens with an id of its own, and the shell shall refuse an id the page already uses as `stream_in_use`. For a stream route, it shall send each line to the page's channel, then `end`, or `failed` when the stream broke off; when the host refuses the stream, it shall answer the host's status and body instead. When the page ends a stream, even before the host has answered, and when the page reloads or its window closes, the shell shall hang up on the host. When it starts the host in the WSL distro, it shall read the updater's `status` once, within 10 seconds, and keep whether the distro's security updates are overdue (more than 7 days, W2 of HAL-5407); `agent_host_security_updates` shall start the host when none runs and answer that as `{ overdue, last }`, with `last` null when there is no date (they never ran, the status didn't say, or it couldn't be read in time, which counts as overdue), and answer null for a host beside the shell. Overdue updates shall never stop the host from starting. At the same start it shall read once, within 10 seconds, whether `halonic` is WSL's default distro (W6 of HAL-5407, HAL-12445), and `agent_host_security_updates` shall answer it as a third field, `isDefaultDistro`; a default it can't read, or a list that marks none, shall be answered as false and logged, because the warning tells the person to change their default. Reading it shall never stop the host from starting.

## Examples

- Given Windows with no saved sandbox choice and no Halonic distro,
  when the page calls `agent_host_request`,
  then the shell refuses it as `host_unavailable` with the reason `distro-missing`, and starts no local host.
- Given the host started in the distro and a `status` whose `securityUpdated` is 8 days old,
  when the page calls `agent_host_security_updates`,
  then the shell answers `{ overdue: true, last: <that time> }`; for a `status` it can't read or that hasn't answered within 10 seconds, `{ overdue: true, last: null }`; for the local host, null.
- Given the host started in the distro on a Windows whose `wsl --list --verbose` marks `halonic` with `*`,
  when the page calls `agent_host_security_updates`,
  then `isDefaultDistro` is true; when the list can't be read in time, it is false and the shell logs why.
- Given a saved choice of `srt` on Windows,
  when the page calls `agent_host_request`,
  then the shell starts the local host.

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
