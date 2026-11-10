# engine.local-runs-unbuilt-effect

- Status: active
- Since: 0.1.0
- Source: HAL-1527, Liam's review of halonic#787; HAL-189 (harness runs); HAL-1535 (child runs are carried out)

When a step of the local executor asks for an effect it can't carry out yet (a tool call or a harness run), the executor shall end the run with `run.failed`, `reason: "error"` and an error that names the effect, and shall set no timer for that step's effects.

## Examples

- Given a step that asks for a `call-tool` effect,
  when the local executor records it,
  then the run ends as failed with an error that names `call-tool`, and no timer is set.
- Given a task state whose agent runs in Claude Code,
  when the local executor starts the run,
  then the run ends as failed with an error that names `run-harness`, and no timer is set.
