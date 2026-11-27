# action-steppers.changed-after-start

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); task HAL-17520; plan approved by the maintainer on HAL-17520 (27 Nov)

Where a stepper definition's `check` step names a `changedAfterStart` field, the action-steppers package shall refuse the definition in `routesOf` unless that field is one of the step's `keep` fields, and `checkChangedAfterStart` shall pass only when the kept field is an ISO 8601 instant with a zone that is later than the start time it is given, comparing parsed instants, and fail closed when the field is missing, isn't such an instant, or equals or precedes the start. The start time comes from the shell's own clock when the stepper opens, never from the request or the definition.

## Examples

- Given a start of `2026-11-27T09:00:00Z` and a kept `updated_at` of `2026-11-27T09:00:01Z`,
  when the check is judged,
  then it passes.
- Given the same start and a kept `updated_at` of `2026-11-26T18:30:00Z` or `2026-11-27T10:00:00+01:00`,
  when the check is judged,
  then it fails with "It hasn't changed since this stepper opened."
- Given no `updated_at`, a number, or a time with no zone,
  when the check is judged,
  then it fails with "The service gave no valid time in "updated_at"."
- Given a `check` whose `changedAfterStart` is `created_at` while it keeps only `name` and `updated_at`,
  when its routes are built,
  then it throws, naming the definition, the step and `created_at`.
