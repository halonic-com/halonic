# app.sandbox-start-check

- Status: active
- Since: unreleased
- Source: HAL-4293 (plan approved on HAL-10918, point 3); HAL-2089 (the check's own sentence never reaches a screen)

The sandbox-start check shall wrap the host's raw sandbox check and answer only whether the sandbox can start, with the reason code when it can't. A failed check whose code is unknown or missing shall answer `other`. The check's own sentences, and anything else it carries, shall never be part of the answer. A raw check that throws shall make the answer reject.

## Examples

- Given a raw check that is ok,
  then the answer is `{ ok: true }`.
- Given a raw check that fails with `bubblewrap-missing`,
  then the answer is `{ ok: false, reason: "bubblewrap-missing" }`.
- Given a raw check that fails with `other` and a `missing` sentence,
  then the answer has the reason `other` and no sentence.
- Given a raw check that fails with a code from a newer version,
  then the answer's reason is `other`.
- Given a raw check that throws,
  then `check` rejects with the same error.
