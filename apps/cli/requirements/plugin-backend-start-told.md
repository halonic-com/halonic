# cli.plugin-backend-start-told

- Status: active
- Since: unreleased
- Source: HAL-15113; the agent host keeps a plugin's stop for the plugin page's R15 (`agent-host.plugin-run-state`); the opener is the one `cli.open-plugin-backend` describes

When the opener of a plugin's backend has started its runner through the start gate, or the gate started nothing, it shall tell the machine's `onStart`, when it has one, the plugin's id and what came of that start: `fenced`, `unfenced`, `needs-yes` or `stopped`, the last when the runner's fence proof failed though the computer passed the sandbox check. The hook shall never change the start, even when it throws.

## Examples

- Given a trusted plugin and a computer in the sandbox,
  when a run calls its tool,
  then `onStart` is told `weather: fenced`.
- Given Windows without the user's yes,
  when a run calls the tool,
  then the call fails and `onStart` is told `weather: needs-yes`.
- Given a runner whose fence proof fails though the computer passed the sandbox check,
  when a run calls the tool,
  then the call fails, the runner is stopped and `onStart` is told `weather: stopped`.
- Given an `onStart` that throws,
  when a run calls the tool of a trusted plugin,
  then the call still answers.
