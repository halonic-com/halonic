# agent-host-client.plugins

- Status: active
- Since: unreleased
- Source: HAL-9389; Liam's plan approval on HAL-9389; `agent-host.plugin-routes`

The plugin stand-in shall offer `call` with a plugin's id, a tool and its arguments, and ask the host's `POST /v1/plugins/call` with those three and nothing else, so the page never sends a path, a trust record or a secret. It shall answer the tool's text. It shall fail with the host's kind and status when the host refuses (`plugin_not_trusted`, `not_fenced`, `not_in_this_build`, `too_many_plugins`, `host_stopping`, `plugin_failed`), with a message that says why in plain words and, for `not_fenced`, that nothing was started. It shall fail with `answer_invalid` for an answer that isn't a tool's.

## Examples

- Given a host that answers a tool call with `{ text: "done" }`,
  when Studio calls the plugin's tool,
  then the host gets `{ plugin, tool, args }` and the answer is `done`.
- Given a host on Windows, where no sandbox fences a plugin,
  when Studio calls a tool,
  then it fails with status 403, the kind `not_fenced` and a message that says plugin tools can't run here yet.
- Given a host that doesn't cover the plugin's trust,
  when Studio calls a tool,
  then it fails with the kind `plugin_not_trusted`.
- Given a host that answers something else with 200,
  when Studio calls a tool,
  then it fails with the kind `answer_invalid`.
