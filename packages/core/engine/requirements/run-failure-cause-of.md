# engine.run-failure-cause-of

- Status: active
- Since: 0.1.0
- Source: HAL-11593 (Liam's decision on HAL-715); Studio's "API off" chip and run banner

The engine shall turn the error that stopped a run into the typed `cause` its `run.failed` event records (requirement `events.run-failed-cause`) in one function, `failureCauseOf(error)`. The `kind` shall be the error's kind (`errorKindOf`); an error without a kind, or with the kind `internal`, shall give no cause. The `code` and `detail` shall come from the error's `failureCause` property, which an integration sets to name its own cause, such as `google.api-disabled` with the API, the project and the link that switches it on. The engine shall not trust that property: it shall keep a `code` only when it is lower-case words joined by dots or dashes, and a `detail` entry only when its key is one camel-case word of at most 40 characters and its value is a string of at most 300 characters that holds nothing shaped like a key (`findSecretShape`), keeping at most 8 entries and leaving `detail` out when none is kept. It shall read only the error itself, not its `cause`. A call that fails shall end the run with `run.failed` carrying that cause when there is one, and without a `cause` otherwise, as before.

## Examples

- Given an error with the kind `denied` and a `failureCause` of `{ code: "google.api-disabled", detail: { api: "drive.googleapis.com", project: "123456" } }`,
  when `failureCauseOf` reads it,
  then the cause is `{ kind: "denied", code: "google.api-disabled", detail: { api: "drive.googleapis.com", project: "123456" } }`.
- Given an error with the kind `unavailable` and no `failureCause`,
  when `failureCauseOf` reads it,
  then the cause is `{ kind: "unavailable" }`.
- Given a `TypeError`, or an error whose kind is `internal`,
  when `failureCauseOf` reads it,
  then there is no cause.
- Given a `failureCause` whose `code` is `Not A Code`, and whose `detail` has a value shaped like a key, a number and a 301-character string,
  when `failureCauseOf` reads it,
  then the cause has the kind only.
- Given an error with a kind whose `cause` has a kind and a `failureCause`,
  when `failureCauseOf` reads it,
  then it takes nothing from that `cause`.
- Given a connector call that throws such an error while a run waits on it,
  when the run fails,
  then `run.failed` has the `reason` the error gives and the `cause`, and the run summary has the same `cause`.
