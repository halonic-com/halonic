# events.tool-result-cause

- Status: active
- Since: unreleased
- Source: HAL-12471, plan approved by Liam on HAL-12575; follow-up to HAL-12429 (the step panel's "Didn't work:" line, microcopy 1.6, E1); the plugin reasons from HAL-14974 (Kim's C522 finding on HAL-14972: a run with a plugin added but not trusted warned only "couldn't list its tools")

The events package shall let a `tool.result` event say why its tool call failed, when the engine knows, in an optional `cause` with a `code`: `time-limit` with the `seconds` the tool had to answer, `engine-stopped` when the engine stopped during the call, `not-made` with the reason the engine didn't make the call in `why` (`not-connected`, `tool-gone`, `sending-off` or `bad-arguments`), or `connector-not-started` with the reason in `why` (`program-missing`, `secret-not-set`, `plugin-not-trusted`, `plugin-changed` or `other`) and optionally the program's or the secret's `name`, or the plugin's id, at most 120 characters, never a secret's value. The package shall give a reader, `toolFailureCauseOf`, that reads a cause with a code it doesn't know, a field of the wrong type or a missing field as absent, never throws, and copies only the cause's own fields. Logs written before the field existed read as before, without a cause.

## Examples

- Given a `tool.result` event with `cause: { code: "time-limit", seconds: 60 }`,
  when its type is checked and its cause is read,
  then it is a valid run event and the cause comes back as written.
- Given a logged cause with a code the reader doesn't know,
  when it is read,
  then it reads as absent.
- Given a logged `time-limit` cause whose `seconds` is a string,
  when it is read,
  then it reads as absent.
- Given a logged `connector-not-started` cause with an extra field,
  when it is read,
  then only `code`, `why` and `name` come back.
- Given the old run log,
  when its `tool.result` events are read,
  then none has a cause.
