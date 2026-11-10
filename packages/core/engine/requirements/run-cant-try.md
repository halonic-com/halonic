# engine.run-cant-try

- Status: active
- Since: 0.1.0
- Source: HAL-3277 plan, "Try it and Test: what's left out"; Liam's decision on HAL-4285

The engine shall never run a step of a Try it or Test run that can't be tried because it needs a change left out of the run, and shall end such a run with `run.cant-try`, not `run.failed` and never `run.completed`:

- the steps the caller found when it loaded the item come in the start's `cantTry` and go on `run.started`; a step with `step: null` is the whole item, and the run enters no state;
- a step the run reaches that is in that list ends the run there, after its `state.entered`, as a failed step would, and asks for no call;
- a call whose adapter throws a `CantTryError` while running adds that step, with the state it ran in, and ends its branch as a failure does: a task state's or a for-each item's ends the run, a parallel branch's is reported on the branch's `agent.finished`, and a child run's ends its parent's `workflow` state;
- once every branch of a parallel state has ended, a branch that couldn't be tried ends the run with `run.cant-try`, whatever `join` and `continueOnError` say, unless a branch really failed and that fails the state: a real failure wins, the run ends with `run.failed`, and the steps stay in the log;
- `run.cant-try` lists every step the run couldn't try: the ones found at load, then the ones found while running;
- a run that ended so takes no more input, as any ended run.

## Examples

- Given a start whose `cantTry` names the step `draft`,
  when the run starts,
  then it logs `run.started` with that step, `state.entered` for `draft` and `run.cant-try`, and asks for no model call.
- Given a start whose `cantTry` has a step `null`,
  when the run starts,
  then it logs `run.started` and `run.cant-try` with no state.
- Given a run at a task state whose model call fails with a `CantTryError`,
  when the failure is recorded,
  then the run ends with `run.cant-try` listing the steps found at load and that step.
- Given a parallel state where one branch can't be tried and the other really fails,
  when both have ended,
  then the run ends with `run.failed`, and the first branch's `agent.finished` keeps its step.
- Given a parallel state with `continueOnError` where one branch can't be tried and the other answers,
  when both have ended,
  then the run ends with `run.cant-try`.
