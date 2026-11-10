# events.sandbox-off

- Status: active
- Since: 0.1.0
- Source: board approval of proposal 1 ("What this run can do") in the `proposals` document on HAL-1601; the facts for the sandbox screens on HAL-1782 (P2); task HAL-1707

The run log shall have a `sandbox.off` event, with the step's `state`, its `agent` and `chosenAt`, written when a step runs without the sandbox because a person chose to run that agent on this computer. `chosenAt` is when the person made that choice, as an ISO 8601 date and time. A step has either `sandbox.opened` or `sandbox.off`, so a run page can tell a sandboxed step, a step that ran without the sandbox, and a step from an older log that has neither. Each event opens a timeline entry of its own. Older logs have no such event and read as before.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `sandbox.off` is among them, with `state`, `agent` and `chosenAt`.
