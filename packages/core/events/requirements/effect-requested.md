# events.effect-requested

- Status: active
- Since: 0.1.0
- Source: [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan), "Idempotency keys and unknown outcome", the "effect requested" record the port ADR plans; task HAL-1532

The run log shall have an `effect.requested` event, written before a step makes a connector call that can change things, with the step's `state`, its `agent`, the connector's id in the workspace in `connector`, the tool as the model named it in `tool`, the call's `args`, the engine's id for the call in `callId`, the key the connector gets in `idempotencyKey`, and where the agent goes on once the call has a result in `resume`. A call with this event and no `tool.result` after it may or may not have done its work, so a reader counts its outcome as unknown.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `effect.requested` is among them, with `state`, `agent`, `connector`, `tool`, `args`, `callId`, `idempotencyKey` and `resume`.
- Given an `effect.requested` event without `idempotencyKey`,
  when its type is checked,
  then it is not a valid run event.
