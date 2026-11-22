# agent-host.plugin-routes

- Status: active
- Since: unreleased
- Source: HAL-9389; Liam's plan approval on HAL-9389; HAL-15537 (`plugin_stopped`, plan approved by Liam on HAL-15488)

When Studio calls a tool of a plugin's backend on the agent host, the agent host shall check, itself and at every call, that the trust record in its profile covers the plugin as its folder holds it now, and shall run the backend only in a sandboxed runner of its own, never in Studio's page or in the host's process. The request names the plugin by its id only. If the trust doesn't cover the plugin, then the agent host shall refuse the call with 403 and stop any runner it holds for that plugin. If the sandbox that fences the runner isn't available on this computer, then the agent host shall refuse the call with 403 `not_fenced` and start nothing, unless the user's yes saved in the profile is for the reason at this start (`agent-host.unfenced-runs-routes`); then it shall start the runner in the launcher's sandbox, through the same start gate, and register it so Take back stops it. If the computer passed the sandbox check but the runner's fence didn't hold, so the runner was stopped before the plugin ran, then the agent host shall refuse the call with 403 `plugin_stopped` and its own fixed message, never the plugin's name or the error's text, shall keep the plugin's other parts running, as for `not_fenced`, and shall try the sandbox again at the next call. It shall never fall back to running without a sandbox by itself. If the agent host is the shipped single executable, which has no runner mode of its own, then it shall refuse the call with 403 `not_in_this_build` and start nothing. The agent host shall keep at most one runner per plugin, started under the trust fingerprint that covered the plugin, and shall never reuse it for a plugin that changed. It shall keep at most 8 plugins running, and shall answer 429 for a call that would start a ninth. If a runner fails during a call, then the agent host shall remove it, so the next call starts a new one. When the agent host stops, it shall stop every runner.

## Examples

- Given a trusted plugin,
  when Studio calls its tool twice,
  then one runner serves both calls.
- Given a plugin whose files changed since it was trusted,
  when Studio calls its tool,
  then the answer is 403, the runner that was running is stopped, and none starts.
- Given a computer with no sandbox for the runner and no saved yes for its reason,
  when Studio calls a plugin's tool,
  then the answer is 403 `not_fenced` and nothing starts.
- Given a computer that passed the sandbox check and a runner whose fence proof fails,
  when Studio calls a plugin's tool,
  then the answer is 403 `plugin_stopped` with "Halonic stopped this plugin: its sandbox didn't hold, so it didn't run. The next call tries the sandbox again.", and the next call starts the runner again.
- Given Windows and the user's saved yes for `windows`,
  when Studio calls a plugin's tool,
  then the runner starts in the launcher's sandbox.
- Given the shipped single executable,
  when Studio calls a plugin's tool,
  then the answer is 403 `not_in_this_build` and nothing starts.
- Given a plugin id that is a path, `.` or `..`,
  when the host reads the request,
  then the answer is 400 and nothing is read from disk.
- Given eight plugins running,
  when Studio calls a ninth,
  then the answer is 429.
- Given a runner that crashed in a call,
  when Studio calls the plugin again,
  then a new runner serves it.
- Given running plugins,
  when the host stops,
  then every runner is stopped and a call answers 503.
