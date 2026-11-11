# engine.model-call-stop

- Status: active
- Since: 0.1.0
- Source: review follow-up on HAL-5216 (finding 658, engine half), plan approved on HAL-5556

The local executor shall stop a run's model call going on when the run is cancelled, when its top-level run ends, and when the engine stops, as it stops harness calls. With the host's `abortOnStop`, the request to the provider shall be aborted, and the listener on the stop removed once the call has settled. A stopped call shall try no other model, and the run shall record nothing it gives: a stop is not the call's failure. Without `abortOnStop`, the call shall run to its end and its answer shall be dropped.

## Examples

- Given a run whose model call is waiting on the provider,
  when the run is cancelled,
  then the provider's request is aborted, its fallback model isn't called, no `llm.fallback` is written, and the run's log ends with one `run.failed`, `reason: "cancelled"`.
- Given a run whose model call is waiting on the provider,
  when the engine stops,
  then the request is aborted and the run's log doesn't change.
- Given a model call that answered,
  when it has ended,
  then no listener is left on its stop.
