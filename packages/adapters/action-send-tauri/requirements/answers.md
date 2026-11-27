# action-send-tauri.answers

- Status: draft
- Since: unreleased
- Source: HAL-17526, HAL-20267; architecture note on HAL-17491 (4.2)

The Tauri action sender shall rebuild each of the shell's answers field by field from the fields the `ActionSender` port names, and shall reject with an `ActionShellError` of failure `malformed-answer` an answer with any other field, an unknown `outcome`, a status outside 100 to 599, a kept field that isn't a plain value, an `unusable` other than `more-than-one` or one that comes with a status outside 200 to 299, a kept field or error text, an account for another service, or an empty account name. It shall cap a service's error message at `maxActionErrorLength` of `@halonicjs/events`. It shall take a device code only as exactly `code`, `page` and `expiresIn`, with an `https` page and a whole number of seconds.

## Examples

- Given a shell that answers a send with `{ "outcome": "answered", "status": 201, "kept": {}, "token": "…" }`,
  when the page sends a step,
  then it rejects as `malformed-answer`, and the token is never handed back.
- Given a shell that answers with `{ "outcome": "answered", "status": 201, "kept": { "details": { "a": 1 } } }`,
  when the page sends a step,
  then it rejects as `malformed-answer`.
- Given a shell that answers a send with `{ "outcome": "answered", "status": 200, "kept": {}, "unusable": "more-than-one", "error": "…" }`,
  when the page sends a step,
  then it rejects as `malformed-answer`.
