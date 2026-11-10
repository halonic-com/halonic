# app.run-send

- Status: active
- Since: 0.1.0
- Source: HAL-2742, HAL-3827; C174 on HAL-2000 and HAL-1984; C224 on HAL-2588; cli-output revision 27, section 3.4 (HAL-1981)

The run events service shall send an event to a run only while the run is waiting for that event. It shall name no call, so the engine answers the oldest waiting item. It shall refuse a send to a run that doesn't exist as `not_found`, to a run that isn't waiting as `conflict` with the run's summary, and of an event the waiting step doesn't take as `invalid_input` with the step and the events it takes. It shall refuse nothing else of its own. When the engine refuses a send because the run moved on after the check, the service shall refuse it the same way, by what the run's log then says.

## Examples

- Given run `run_a1` waiting for `approve` or `reject`,
  when `approve` is sent,
  then the executor gets `approve` for `run_a1` with no call named, and its summary comes back.
- Given no run `run_zz`,
  when `approve` is sent to it,
  then the send is refused as `not_found`, and the executor gets nothing.
- Given run `run_a1` that has completed,
  when `approve` is sent,
  then the send is refused as `conflict` with the completed run's summary.
- Given run `run_a1` waiting at `review` for `approve` or `reject`,
  when `aprove` is sent,
  then the send is refused as `invalid_input` with step `review` and the events `approve` and `reject`.
- Given run `run_a1` that waits when checked but has failed by the time the engine gets the send,
  when `approve` is sent,
  then the send is refused as `conflict` with the failed run's summary.
- Given a run whose executor fails for another reason,
  when an event is sent,
  then that error comes through unchanged.
