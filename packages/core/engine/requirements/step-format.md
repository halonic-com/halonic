# engine.step-format

- Status: active
- Since: 0.1.0
- Source: HAL-6982; E8 in HAL-185's engine bug decisions; the workflow schema's `format`, "the reply format for this step, instead of the agent's own"

When a `task` state or a `foreach` state whose items run its agent has a `format`, the engine shall check each answer against that format instead of the agent's own `output`: `json` reads the answer as JSON, as an agent whose `output` is `json` is, and `text` keeps it as it is. The step's `format` comes before the `output` of the method the step calls (`engine.task-method`), and both come before the agent's own. The run's model call shall tell the model to reply in the same format. The engine shall read the format from the definitions the run started with, so the run log and its calls keep their shape.

## Examples

- Given a task step with `format: json` whose agent's output is a choice, when the agent answers `{"keep": true}` in a code fence, then the step's output is that object.
- Given a task step with `format: text` whose agent's output is a choice, when the agent answers `Maybe later`, then the step's output is that text and the run goes on.
- Given a foreach step with `format: json`, when an item's agent answers `paper is fine`, then the run fails.
