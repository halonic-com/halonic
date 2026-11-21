# agent-host.plugin-local-tools

- Status: active
- Since: unreleased
- Source: HAL-12343; the board's option A on HAL-1731 (local tools ship in v0.1)

When Studio calls a tool of a trusted plugin on the agent host, the agent host shall send the call to the part of the plugin that declares the tool: its backend, in a sandboxed runner, or one of its local tools, in a sandbox session of its own that runs from a copy of the files the person trusted and never reaches the person's credential folders or Halonic's profile. A plugin whose only part is a local tool shall be callable like one with a backend. The agent host shall start no part of a plugin whose folder no longer has the fingerprint the call checked. If a local tool can't run fenced on this computer, then the agent host shall refuse that call with 403 `not_fenced`, keep the plugin's other parts working and write in its log which part is off and why, as a code, never the error's text. If a local tool needs a setting that has no value, then the call shall fail without a refusal and the log shall name the code `settings-not-set`.

## Examples

- Given a trusted plugin with a backend and a local tool,
  when Studio calls the local tool's tool and then the backend's,
  then the local tool answers the first and the runner answers the second.
- Given a computer where the local tool's sandbox can't start,
  when Studio calls the local tool's tool,
  then the answer is 403 `not_fenced`, a call of the backend's tool still answers, and the log names the part and `sandbox-unavailable`.
- Given a trusted plugin whose only part is a local tool,
  when Studio calls its tool,
  then the local tool answers and no runner starts.
- Given a plugin whose local tool's script changed after the call checked its fingerprint,
  when the host opens the plugin,
  then it refuses with `plugin_not_trusted` and starts no part.
