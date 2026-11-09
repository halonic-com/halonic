# engine.turn-runs-tool-calls

- Status: active
- Since: 0.1.0
- Source: HAL-1061 (the local chat turn, plan 4.5 and D42)

When the engine runs a model turn, it shall offer the model the caller's tools, then Halonic's own tools, then the tools each connected server lists. When the model calls one of Halonic's tools or a server's tool, the engine shall run it (a server's tool under the name the server listed it with), give the model its result as a tool message for that call, and ask the model again, until the model answers without such a call. The turn shall return every assistant and tool message it added, ending with the last answer, and the usage of all its model calls added up.

## Examples

- Given a server that lists `lookup` and a model that calls `lookup` and then answers "Found it",
  when the turn runs,
  then the server gets the call, the model's second request ends with the tool message for it, and the turn ends with "Found it".
- Given a Halonic tool `remember` and a server tool `lookup`, and a caller tool `pick`,
  when the turn asks the model,
  then the model is offered `pick`, `remember` and `lookup`, in that order.
