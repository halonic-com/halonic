# events.action-requested-run-event

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); ADR `docs/adr/2026-11-24-action-sender.md` ("`action.requested` ... joins `RunEventBody` in the engine's filing PR"); task HAL-17529

The run log shall have an `action.requested` event when an agent files a request to run a reviewed action stepper, with the same fields as the action event `action.requested` (`events.action-events`) except `at`, which is the log line's own. The other action events shall stay out of the run log.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `action.requested` is one of them, and `action.reviewed` and `action.finished` are not.
- Given an `action.requested` run log line,
  when its body is read,
  then it has `request`, `definition`, `version`, `parameters`, `requester`, `reason`, `expires` and an optional `expect`, and no `at` of its own.
