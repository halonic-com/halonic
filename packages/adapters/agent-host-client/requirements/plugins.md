# agent-host-client.plugins

- Status: active
- Since: unreleased
- Source: HAL-9389; Liam's plan approval on HAL-9389; `agent-host.plugin-routes`; HAL-15537 (`plugin_stopped`); words check C629 rows 23, 24 and 26 (HAL-15781, HAL-15792)

The plugin stand-in shall offer `call` with a plugin's id, a tool and its arguments, and ask the host's `POST /v1/plugins/call` with those three and nothing else, so the page never sends a path, a trust record or a secret. It shall answer the tool's text. It shall fail with the host's kind and status when the host refuses (`plugin_not_trusted`, `not_fenced`, `plugin_stopped`, `not_in_this_build`, `too_many_plugins`, `host_stopping`, `plugin_failed`), with a message that says why in plain words and, for `not_fenced`, that nothing was started; for `plugin_stopped` it shall say "Halonic stopped this plugin: the sandbox didn't work when it started, so none of it ran." It shall fail with `answer_invalid` for an answer that isn't a tool's.

## Examples

- Given a host that answers a tool call with `{ text: "done" }`,
  when Studio calls the plugin's tool,
  then the host gets `{ plugin, tool, args }` and the answer is `done`.
- Given a host on Windows, where no sandbox fences a plugin,
  when Studio calls a tool,
  then it fails with status 403, the kind `not_fenced` and a message that says plugin tools can't run here yet.
- Given a host whose runner's fence didn't hold,
  when Studio calls a tool,
  then it fails with status 403, the kind `plugin_stopped` and "Halonic stopped this plugin: the sandbox didn't work when it started, so none of it ran."
- Given a host that doesn't cover the plugin's trust,
  when Studio calls a tool,
  then it fails with the kind `plugin_not_trusted`.
- Given a host that answers something else with 200,
  when Studio calls a tool,
  then it fails with the kind `answer_invalid`.
