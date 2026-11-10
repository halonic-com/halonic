# engine.turn-approval-stop

- Status: active
- Since: 0.1.0
- Source: HAL-3331, plan HAL-186 step 4a (the run half, decided on HAL-3325)

When the check before a call in a run's model turn asks a person first, the engine shall run the calls of that answer before it, then stop before that call with `{ type: "approval", tool, args, resume }`. `resume` shall be plain JSON: the conversation so far, the waiting call followed by the calls after it, and the round of the answer that made them, and no key or other secret. When the turn goes on from `resume` with an approval, the engine shall run the waiting call; with a rejection, it shall not run it and shall give the model the refusal, with what the person wrote, as the call's result. The engine shall then check and run the remaining calls in order, stopping again at the next one that asks, and ask the model again, counting rounds on from `resume`. A chat turn shall never stop: a check that asks there makes the turn fail.

## Examples

- Given a model that calls `lookup`, `publish` and `lookup`, and a check that asks about `publish`,
  when the turn runs,
  then the first `lookup` runs, `publish` doesn't, and the turn stops with `resume.calls` holding `publish` then the second `lookup`, at step 1.
- Given that stop, saved as JSON and read back in a new process,
  when the turn goes on with an approval,
  then `publish` runs, then the second `lookup`, then the model is asked again and its answer ends the turn.
- Given that stop,
  when the turn goes on with a rejection and the comment "Not today",
  then `publish` doesn't run, and the model gets "Refused: a person rejected the call and wrote: Not today" as its result.
