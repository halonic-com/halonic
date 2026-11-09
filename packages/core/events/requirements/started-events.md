# events.started-events

- Status: active
- Since: 0.1.0
- Source: failure-path rule 1 in the [HAL-1668 decisions](/HAL/issues/HAL-1668#document-decisions) (`docs/guides/failure-path.md`); stack 1a of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan), approved by Liam on HAL-1967; task HAL-189

The run log shall have a `sandbox.started` event, with the step's `state`, its `agent` and `timeoutMs`, and a `harness.started` event, with the step's `state`, its `agent`, the agent's `harness` id and `timeoutMs`. The engine writes each one before it opens the sandbox or starts the harness program, so a screen can say what a step waits for while it waits. `timeoutMs` is how long the engine waits, in milliseconds, before the step fails: for the sandbox to open, or for the harness's first event. Each event opens a timeline entry of its own. Older logs have neither event and read as before.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `sandbox.started` is among them, with `state`, `agent` and `timeoutMs`, all required.
- Given the event types of the run log,
  when they are listed,
  then `harness.started` is among them, with `state`, `agent`, `harness` and `timeoutMs`, all required.
- Given a `sandbox.started` event followed by `sandbox.opened` for the same step, and a `harness.started` event,
  when their timeline entries are worked out,
  then each is its own `seq`.
