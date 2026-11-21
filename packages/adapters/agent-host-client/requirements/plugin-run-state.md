# agent-host-client.plugin-run-state

- Status: active
- Since: unreleased
- Source: HAL-15113; the plugin page's R15 in the "Runs" line design on HAL-1873 (`rl-page-stopped`), approved by the board on HAL-1949; the host's side is `agent-host.plugin-run-state`

When Studio asks whether a plugin's runner stopped because the sandbox failed while it ran, the agent host client shall send the agent host only the plugin's id, and answer either a stop with the time the host gives or not stopped. When the person presses **Check again**, it shall ask the host to forget that plugin's stop, again with the plugin's id only. It shall accept only those two answers, with no other field, and fail with `answer_invalid` for anything else; a refusal shall keep the host's kind.

## Examples

- Given a host that stopped `weather` at 18:00,
  when Studio asks for `weather`'s run state,
  then the answer is a stop at that time, and the request held only `{ plugin: "weather" }`.
- Given an answer with an extra field, or a stop without its time,
  when Studio reads it,
  then it fails with `answer_invalid`.
- Given a stopped plugin,
  when the person presses **Check again**,
  then the client asks the host to forget the stop and answers not stopped.
