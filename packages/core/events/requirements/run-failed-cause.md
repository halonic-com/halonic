# events.run-failed-cause

- Status: active
- Since: 0.1.0
- Source: HAL-11593 (Liam's decision on HAL-715); Studio's "API off" chip and run banner

The events package shall let a `run.failed` event carry the typed cause of the failure in an optional `cause`, and the run summary shall carry it as `cause`, so a screen tells one failure from another without reading the free-text `error`. A cause has a `kind`, which is one of the eight kit error kinds (`invalid_input`, `not_found`, `conflict`, `unauthenticated`, `denied`, `limit_reached`, `unavailable`, `internal`), and optionally a `code`, a stable string for a cause a screen knows by name, such as `google.api-disabled`, and a `detail`, a record of short strings the cause names, such as the API, the project and a link. A cause shall never hold a credential or a provider's own error text. A reader that doesn't know a `code` still has the `kind`. A run log written before the field existed, and a `run.failed` without a cause, shall load as before: the summary then has no `cause`.

## Examples

- Given a `run.failed` event with a `cause` of `{ kind: "denied", code: "google.api-disabled", detail: { api: "drive.googleapis.com" } }`,
  when the run is summarized,
  then the summary's `cause` is that cause.
- Given a `run.failed` event with a `cause` that has only a `kind`,
  when the run is summarized,
  then the summary's `cause` is `{ kind }` with no `code` and no `detail`.
- Given a `run.failed` event without a `cause`, as older logs have,
  when the run is summarized,
  then the summary has no `cause` and its `reason` and `error` are as before.
- Given a run that hasn't failed,
  when it is summarized,
  then the summary has no `cause`.
