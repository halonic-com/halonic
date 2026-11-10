# events.run-cant-try

- Status: active
- Since: 0.1.0
- Source: HAL-3277 plan, "Try it and Test: what's left out" (types agreed with Elena on HAL-3401); Liam's decision on HAL-4285

The events package shall let a Try it or Test run say which of its steps it couldn't try because they need a change left out of the run, so no reader counts such a run as completed or as failed:

- `run.started` takes an optional `cantTry`, the steps found when the run's item was loaded;
- a parallel branch's `agent.finished` takes an optional `cantTry`, the one step it couldn't try;
- `workflow.finished` takes the status `cant-try` for a child run that ended so;
- a new final event, `run.cant-try`, ends a run at a step it couldn't try, with every such step in `cantTry`;
- `summarize` gives such a run the status `cant-try` and the steps in `cantTry`. A run that ends with `run.failed` stays `failed` and keeps the steps it found.

Older logs never have the status, so no reference event changes for them. A log without these fields and events, as older logs are, shall read as before, with `cantTry: []`.

## Examples

- Given a `run.started` with one step in `cantTry`, then `run.cant-try` with that step,
  when the log is summarized,
  then the status is `cant-try`, `endedAt` is the time of `run.cant-try` and `cantTry` has the step.
- Given a `run.started` with one step in `cantTry`, then `run.failed`,
  when the log is summarized,
  then the status is `failed` and `cantTry` still has the step.
- Given a parallel branch's `agent.finished` with `cantTry`,
  when the log is summarized,
  then the summary's `cantTry` has that step.
- Given an older log without `cantTry` and without `run.cant-try`,
  when it is summarized,
  then it reads as before, with `cantTry: []`.
