# agent-host.connector-routes

- Status: active
- Since: 0.1.0
- Source: HAL-2310 (D45); Liam's decision on HAL-8403

When Studio opens a workspace `stdio` connector on the agent host, the agent host shall start its program and open its sandbox session itself, from the connector file's fields, the values of the connector's own secrets and the trust grant that the request carries, and shall build the connector's sandbox place itself. If the request carries a sandbox profile, then the agent host shall refuse it. If the trust record in the profile that the agent host serves doesn't hold the request's trust grant, with this connector's program, arguments, folder, environment and sites, then the agent host shall refuse it with 403 and start nothing, with or without a sandbox. If the request's workspace folder, as a real path, isn't one of the folders the launcher named with `--sweep-root` (Halonic's profile folder excluded), then the agent host shall refuse it with 403 and start nothing. The agent host shall always add the default agent working folders' parent (`files/agents`) to the working folders the request names, and shall refuse with 403 a request whose working folder isn't inside the workspace folder. If a request names a connector the agent host didn't open, then the agent host shall answer 404. When the connector closes, or the agent host stops, the agent host shall stop its program and close its session.

## Examples

- Given a workspace with no trust record in the host's profile,
  when Studio opens a connector with any trust grant,
  then the answer is 403 and no connector is made.
- Given a trusted workspace,
  when Studio opens a connector whose program, arguments, environment or sites differ from the trusted file,
  then the answer is 403 and no connector is made.

- Given a launcher that named one workspace folder,
  when Studio opens a connector in a different folder, or in a link that leads to one,
  then the answer is 403 and no connector is made.
- Given an open request that names no working folder,
  when the host starts the connector,
  then the connector's start checks `files/agents` of the workspace.
- Given an open request with a working folder outside the workspace,
  when the host reads it,
  then the answer is 403 and no connector is made.
- Given an open request with a `profile` field,
  when the host reads it,
  then the answer is 400 and no connector is made.
- Given an open connector,
  when the host stops,
  then the connector is closed.
- Given an id the host never made,
  when Studio lists its tools, calls a tool or closes it,
  then the answer is 404.
