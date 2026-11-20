# events.trigger-inbox

- Status: active
- Since: unreleased
- Source: HAL-12727 (L5, D3), from the first-run check HAL-12714 (F11)

The events package shall let a run's trigger have the type `inbox`, for a run the person started from the Inbox's request form, with no field beyond `at`, the time it started. When a run's events are summarized, the summary's trigger shall keep it as `run.started` gave it. Every trigger type that existed before reads as it did.

## Examples

- Given `run.started` with the trigger `{ type: "inbox", at: "2026-11-18T10:00:00.000Z" }`,
  when the run is summarized,
  then the summary's trigger is exactly that trigger.
