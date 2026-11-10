# engine.harness-stops-with-engine

- Status: active
- Since: 0.1.0
- Source: HAL-189, stack 4d of its implementation plan; HAL-1668 (failure path, rule 2)

When the engine stops while a harness run is going on, the engine shall stop the harness run, then close its sandbox session, then close its bridge, and shall finish stopping only once all three have stopped. A sandbox session that opens after that shall be closed as soon as it opens. The engine shall record nothing more for the run, and shall start no harness for a timer delivered after it stopped. Because a harness run can't be resumed, the run shall end with `reason: "interrupted"` when an engine next starts on the same store.

## Examples

- Given a harness run that is going on,
  when the host closes the engine,
  then the harness run is cancelled, its session and its bridge are closed, and the run's log ends at what the harness had reported.
- Given that run after the engine closed,
  when an engine next starts on the same store,
  then the run ends with `run.failed` and `reason: "interrupted"`.
