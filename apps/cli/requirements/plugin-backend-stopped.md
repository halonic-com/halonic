# cli.plugin-backend-stopped

- Status: active
- Since: unreleased
- Source: HAL-15488 (flow check C583 #3 on HAL-15487: outside the plugin page a stopped start said "the sandbox failed its check, so nothing runs", which is wrong and names no plugin); the start is the one `cli.plugin-backend-start-told` tells as `stopped`; wording decided by the team (HAL-2282) on HAL-15488, built on the plugin page's R15; words revised by words check C599 on HAL-15593 (HAL-15601), to match Studio's toast

When the opener of a plugin's backend stops a runner whose fence proof failed though the computer passed the sandbox check, the call that needed the backend shall fail with a `PluginBackendStoppedError` that carries the plugin's id in `plugin`, in its chain of causes, whose message says "Halonic stopped the plugin <plugin>: the sandbox didn't work as the plugin started, so nothing ran. Halonic tries <plugin> in the sandbox again the next time a run uses it." It shall not say that the sandbox failed its check, because the check passed.

## Examples

- Given a runner whose fence proof fails though the computer passed the sandbox check,
  when a run calls the `weather` plugin's tool,
  then the call fails with "Halonic stopped the plugin weather: the sandbox didn't work as the plugin started, so nothing ran. Halonic tries weather in the sandbox again the next time a run uses it." and a `PluginBackendStoppedError` whose `plugin` is `weather`.
