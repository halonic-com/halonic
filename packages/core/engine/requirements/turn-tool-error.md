# engine.turn-tool-error

- Status: active
- Since: 0.1.0
- Source: HAL-1061

If a tool the engine runs in a model turn throws, then the engine shall give the model a result that names the tool and the error, record that result in the run log as the call's `tool.result` with `outcome: "error"`, and go on with the turn.

## Examples

- Given a server tool `lookup` that throws "timed out",
  when the model calls it,
  then the model gets "The tool lookup failed: timed out" as its result, and the turn goes on to the model's next answer.
