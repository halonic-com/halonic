# agent-host.connector-routes

- Status: active
- Since: 0.1.0
- Source: HAL-2310 (D45); Liam's decision on HAL-8403

When Studio opens a workspace `stdio` connector on the agent host, the agent host shall start its program and open its sandbox session itself, from the connector file's fields, the values of the connector's own secrets and the trust grant that the request carries, and shall build the connector's sandbox place itself. If the request carries a sandbox profile, then the agent host shall refuse it. If the request's workspace folder, as a real path, isn't one of the folders the launcher named with `--sweep-root` (Halonic's profile folder excluded), then the agent host shall refuse it with 403 and start nothing. If a request names a connector the agent host didn't open, then the agent host shall answer 404. When the connector closes, or the agent host stops, the agent host shall stop its program and close its session.

## Examples

- Given a launcher that named one workspace folder,
  when Studio opens a connector in a different folder, or in a link that leads to one,
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
