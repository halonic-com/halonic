# engine.local-runs-durable

- Status: active
- Since: 0.1.0
- Source: HAL-5214, findings of the 11 Nov code review

When the local executor has stored a step's events but can't carry out one of its effects, because the scheduler or the store fails, it shall keep that effect and the ones after it, and carry them out on the run's next timer, so that, while the engine runs, the run never waits with no timer to move it on. What it keeps lives in memory: after a restart, a running run ends as interrupted, and a waiting run whose kept effect was a timer has none. It shall set a `resume` timer for the run for that, and a run that has ended since drops what was kept. Kept steps are carried out oldest first, also when two timers of the run fail at once. When a model, harness or connector call has an answer but the executor can't record it, it shall keep the answer, and a later delivery of the same timer shall record the kept answer without making the call again.

## Examples

- Given a run whose step stored `agent.started` for `call-1`,
  when setting the timer for `call-1` fails once,
  then the `resume` timer carries the effect out, and the run completes with the model's answer.
- Given a run whose timer for a connector call failed to be set while the model call's timer was delivered, and whose `resume` timer failed too,
  when that model call's timer is delivered again,
  then the connector call is made once and the run completes.
- Given a run whose model call answered but whose result couldn't be stored once,
  when the call's timer is delivered again,
  then the model is called once and the run completes with its answer.
- Given a run whose `send_mail` call succeeded but whose result couldn't be stored once,
  when the call's timer is delivered again,
  then the mail is sent once and the run completes.
