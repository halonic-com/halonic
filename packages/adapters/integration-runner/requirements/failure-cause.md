# integration-runner.failure-cause

- Status: active
- Since: unreleased
- Source: HAL-11593 (review by Liam, part 4); Studio's "API off" chip and run banner

When a tool call fails inside the runner, the runner shall send the error's kind and its `failureCause` (a `code` and a `detail` record of short strings) in the `result` frame next to the message, and Halonic's side shall put them on the `RunnerToolError` it rejects the call with, so the engine records the typed cause of a failed run as it does for an error thrown in its own process. The runner sends only what fits the frame's caps: a `code` of at most 64 characters, at most 8 `detail` entries with a key of at most 40 characters and a value of at most 300. Halonic's side keeps a `kind` only when it is one of the eight kit error kinds, and drops a `code` or `detail` value that the secret filter changes. A `result` frame with text and a cause, or with a cause of another shape, is a protocol violation.

## Examples

- Given an integration whose tool throws an error of kind `denied` with the failure cause `{ code: "google.api-disabled", detail: { api: "drive.googleapis.com" } }`,
  when Halonic calls the tool,
  then the call rejects with a `RunnerToolError` of kind `denied` that carries that failure cause.
- Given a tool that throws an error without a kind,
  when Halonic calls the tool,
  then the `RunnerToolError` has no kind and no failure cause.
- Given a `result` frame whose `kind` is not an error kind,
  then the `RunnerToolError` has no kind.
- Given a `result` frame whose `detail` value holds a secret value,
  then that value is not on the `RunnerToolError`, and the other values are.
- Given a failure cause with a `detail` value of 301 characters,
  then the runner leaves that value out of the frame.
