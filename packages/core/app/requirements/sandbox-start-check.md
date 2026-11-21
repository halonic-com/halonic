# app.sandbox-start-check

- Status: active
- Since: unreleased
- Source: HAL-4293 (plan approved on HAL-10918, point 3); HAL-2089 (the check's own sentence never reaches a screen); HAL-4291 and HAL-14960 (checklist 3.2: Copy details for `other`)

The sandbox-start check shall wrap the host's raw sandbox check and answer only whether the sandbox can start, with the reason code when it can't. A failed check whose code is unknown or missing shall answer `other`. The check's own sentences shall be part of the answer only for `other`, as `details` for Copy details alone, because `other`'s code says nothing about what is missing; for every other reason they, and anything else the check carries, shall never be part of the answer. A raw check that throws shall make the answer reject.

## Examples

- Given a raw check that is ok,
  then the answer is `{ ok: true }`.
- Given a raw check that fails with `bubblewrap-missing`,
  then the answer is `{ ok: false, reason: "bubblewrap-missing" }`.
- Given a raw check that fails with `other` and two `missing` sentences,
  then the answer has the reason `other` and the two sentences, one per line, as its details.
- Given a raw check that fails with `bubblewrap-missing` and a `missing` sentence,
  then the answer has the reason and no sentence.
- Given a raw check that fails with `other` and no `missing` sentence,
  then the answer has the reason `other` and no details.
- Given a raw check that fails with a code from a newer version,
  then the answer's reason is `other`.
- Given a raw check that throws,
  then `check` rejects with the same error.
