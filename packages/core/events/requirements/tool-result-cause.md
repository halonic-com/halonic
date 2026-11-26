# events.tool-result-cause

- Status: active
- Since: unreleased
- Source: HAL-12471, plan approved by Liam on HAL-12575; follow-up to HAL-12429 (the step panel's "Didn't work:" line, microcopy 1.6, E1); the plugin reasons from HAL-14974 (Kim's C522 finding on HAL-14972: a run with a plugin added but not trusted warned only "couldn't list its tools"); `plugin-stopped` from flow check C600 #4 (HAL-15608); `sandbox-not-ready`: HAL-14296; `program-stopped` from HAL-15606 (C600 #1); `unfenced-not-allowed` from HAL-15689 (Nina's C611 on HAL-15671); `service-refused` from HAL-19185 (PR 2 of the HAL-19172 plan, approved by Liam with changes on HAL-19172)

The events package shall let a `tool.result` event say why its tool call failed, when the engine knows, in an optional `cause` with a `code`: `time-limit` with the `seconds` the tool had to answer, `engine-stopped` when the engine stopped during the call, `not-made` with the reason the engine didn't make the call in `why` (`not-connected`, `tool-gone`, `sending-off` or `bad-arguments`), or `connector-not-started` with the reason in `why` (`program-missing`, `program-stopped`, `secret-not-set`, `plugin-not-trusted`, `plugin-changed`, `plugin-stopped`, `sandbox-not-ready`, `unfenced-not-allowed` or `other`) and optionally the program's or the secret's `name`, the plugin's id, for `plugin-stopped` the plugin's name, or for `unfenced-not-allowed` the code of why the sandbox isn't available, at most 120 characters, never a secret's value, or `service-refused` with why the service refused the call's last request in `why` (`not-accepted`, `not-allowed`, `slow-down` with how many times Halonic tried again in `retries`, 0 to 2, or `host-not-declared` with the main part of the host in `host`, lower-case ASCII or an address, at most 253 characters) and optionally `sentOnce: true`. The package shall give a reader, `toolFailureCauseOf`, that reads a cause with a code it doesn't know, a field of the wrong type or a missing field as absent, never throws, and copies only the cause's own fields. Logs written before the field existed read as before, without a cause.

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
- Given a logged `service-refused` cause with a `why` the reader doesn't know,
  when it is read,
  then it reads as absent.
- Given a logged `service-refused` cause with `why: "slow-down"` and `retries: 3`,
  when it is read,
  then it reads as absent.
- Given the old run log,
  when its `tool.result` events are read,
  then none has a cause.
