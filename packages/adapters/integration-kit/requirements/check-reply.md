# integration-kit.check-reply

- Status: active
- Since: unreleased
- Source: HAL-19168 (HAL-18391 plan, section 2.1: name the changed field, never quote the reply)

The kit's `checkReply(schema, reply)` shall check a service's reply with the integration's schema and give the parsed reply. When the reply doesn't fit, it shall throw a `ReplyChangedError` of kind `unavailable` whose `failureCause` is `{ code: "reply-changed", detail }`. `detail` shall name each changed field once, as `field.<n>` with its path in the schema and `expected.<n>` with the type or format the schema expected, for at most 4 fields, so it never holds more than the 8 entries a failure note carries across the bridge; the message shall name the same fields and how many more there are. Neither shall hold a value from the reply, a key that only the reply has (Zod's `unrecognized_keys`), or a path segment the schema doesn't name, such as a record's key, which is shown as `{…}`; a numeric index is kept. Each path and expected type is at most 64 characters. Any schema with Zod's `safeParse` fits, so the kit needs no Zod.

## Examples

- Given a schema with an object field `fulfillment`,
  when a reply without it is checked,
  then it throws a `ReplyChangedError` with `failureCause` `{ code: "reply-changed", detail: { "field.1": "fulfillment", "expected.1": "object" } }`.
- Given a reply whose `items.0.price` is a string where the schema wants a number,
  when it is checked,
  then `detail` is `{ "field.1": "items.0.price", "expected.1": "number" }`.
- Given a reply with a key the schema doesn't have,
  when a strict schema refuses it,
  then neither the message nor `detail` names that key.
- Given a reply that holds a canary value in a wrong field and as a record's key,
  when it is checked,
  then the canary appears in neither the message nor `detail`, and the record's key is shown as `{…}`.
- Given a reply with 10 missing fields,
  when it is checked,
  then `detail` has 8 entries, for the first 4 fields, and the message ends "and 6 more".
