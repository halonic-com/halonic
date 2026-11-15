# agent-host.plugin-routes

- Status: active
- Since: 0.1.0
- Source: HAL-9389; Liam's plan approval on HAL-9389

When Studio calls a tool of a plugin's backend on the agent host, the agent host shall check, itself and at every call, that the trust record in its profile covers the plugin as its folder holds it now, and shall run the backend only in a sandboxed runner of its own, never in Studio's page or in the host's process. The request names the plugin by its id only. If the trust doesn't cover the plugin, then the agent host shall refuse the call with 403 and stop any runner it holds for that plugin. If the sandbox that fences the runner isn't available on this computer, then the agent host shall refuse the call with 403 `not_fenced` and start nothing, with no fallback to running without a sandbox. If the agent host is the shipped single executable, which has no runner mode of its own, then it shall refuse the call with 403 `not_in_this_build` and start nothing. The agent host shall keep at most one runner per plugin, started under the trust fingerprint that covered the plugin, and shall never reuse it for a plugin that changed. It shall keep at most 8 plugins running, and shall answer 429 for a call that would start a ninth. If a runner fails during a call, then the agent host shall remove it, so the next call starts a new one. When the agent host stops, it shall stop every runner.

## Examples

- Given a trusted plugin,
  when Studio calls its tool twice,
  then one runner serves both calls.
- Given a plugin whose files changed since it was trusted,
  when Studio calls its tool,
  then the answer is 403, the runner that was running is stopped, and none starts.
- Given a computer with no sandbox for the runner,
  when Studio calls a plugin's tool,
  then the answer is 403 `not_fenced` and nothing starts.
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
