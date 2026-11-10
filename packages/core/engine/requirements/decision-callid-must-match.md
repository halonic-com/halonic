# engine.decision-callid-must-match

- Status: active
- Since: 0.1.0
- Source: HAL-1528, step 3(c) of the HAL-186 plan; E5 and decision 3 on HAL-1515

When an event sent to a run names a call id, and the run doesn't wait for a person's approval of that call, the engine shall refuse the event with `engine.decision-callid-must-match` before anything is recorded, so that a person who answered an approval that has since moved on can't answer the next one by accident. An event without a call id shall not be checked this way.

## Examples

- Given a run waiting in a wait state for `approve`, with no approval pending,
  when `approve` is sent for `call-1`,
  then the engine refuses it with `engine.decision-callid-must-match` and the run log doesn't change.
- Given a run waiting for the approval of `call-2`,
  when `approve` is sent for `call-2`,
  then the call id check lets it through.
