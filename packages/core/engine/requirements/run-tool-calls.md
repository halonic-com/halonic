# engine.run-tool-calls

- Status: active
- Since: 0.1.0
- Source: HAL-3331, plan HAL-186 step 4a (the run half, decided on HAL-3325)

When a workflow run calls a state's agent, the engine shall offer Halonic's tools and the agent's memory tools, run the calls through the same turn loop a chat turn uses, and make at most the agent's `maxSteps` model calls, or 6 when the run's definitions have no file for the agent. The engine shall check every call with `checkToolCall` before it runs. If the check refuses a call, then the engine shall not run it and shall give the model the reason as that call's result. The engine shall offer a connector's tools in a run's model call only where the executor is given connector calls, as `engine.run-connector-calls` says, and shall check a call to one as a listed tool, counting it as `write` when its listing gives no risk. A call that needs a person's OK shall stop the call for an approval, as `engine.turn-approval-stop` says.

## Examples

- Given agent `writer` and a memory store,
  when the run's model calls `memory_save` with a title and a text, then answers "Dear support",
  then the note is saved naming the run, and the state's output is "Dear support".
- Given agent `writer` with `maxSteps: 2` and a model that keeps calling tools,
  when the run calls it,
  then the model gets 2 requests.
- Given a model that calls `memory_save` with an argument `to` the tool doesn't declare,
  when the run calls it,
  then nothing is saved, and the model's next request carries a refusal that names `to` as the call's result.
- Given a Halonic tool whose risk is `write`,
  when the run's model calls it,
  then it doesn't run yet, and the run waits for `approve` or `reject` on that call.
