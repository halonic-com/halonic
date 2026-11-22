# studio.desktop-plugin-run-states

- Status: active
- Since: unreleased
- Source: HAL-15113; the plugin page's R15 (`plugins.plugin-page-stopped`) and the host's run state (`agent-host.plugin-run-state`)

The desktop app shall give the plugin page whether the agent host stopped a plugin because the sandbox didn't work when it started, and R15's **Check again**, through the agent host's `POST /v1/plugins/run-state` and `POST /v1/plugins/run-state/check-again`, sending only the plugin's id.

## Examples

- Given the agent host's transport,
  when the plugin page asks for `weather`'s run state and presses **Check again**,
  then the host is asked on those two routes with `{ plugin: "weather" }` alone.
