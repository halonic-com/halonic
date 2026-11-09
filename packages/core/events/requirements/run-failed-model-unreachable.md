# events.run-failed-model-unreachable

- Status: active
- Since: 0.1.0
- Source: [HAL-1668 failure-path decisions](/HAL/issues/HAL-1668#document-decisions); task HAL-1728

The events package shall let a `run.failed` event give the reason `model-unreachable` when the host of the model did not answer, and name that host in an optional `host`: its name and port, such as `localhost:11434` or `api.anthropic.com`, never a URL with a path, a query or a key. It is the same for a local model server such as Ollama and for a cloud provider. `host` is set only with this reason. Logs written before the field existed read as before.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `model-unreachable`.
- Given a `run.failed` event with `reason: "model-unreachable"` and `host: "localhost:11434"`,
  when its type is checked,
  then it is a valid run event.
- Given a `run.failed` event without `host`,
  when its type is checked,
  then it is a valid run event.
