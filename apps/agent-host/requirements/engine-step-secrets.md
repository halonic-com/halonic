# agent-host.engine-step-secrets

- Status: draft
- Since: unreleased
- Source: HAL-17050 (B1 step 3), HAL-17053 (escaped forms, short values), HAL-17004 (scope), design note D4 on HAL-14206

The engine role shall read a step's secrets and key origins only from Studio's shell, through the control pipe's `secret_get` and `origins_get` broker requests, and shall offer no way to set, remove or add a secret or an origin. It shall check a name against the secret name rule before it asks, and shall refuse a name that breaks it without asking. When the broker refuses a name as `invalid_name` or `reserved_name`, the engine shall treat it as not found. When the broker refuses with `untrusted`, the engine shall refuse as for an untrusted workspace; with `busy`, `unavailable` or `denied`, it shall fail with "secrets unavailable"; with `unreadable` or `failed`, it shall fail the read. If the broker gives an empty list of origins or more than 8, then the engine shall fail the read. The engine shall keep each value it got in memory only until the step ends, shall replace every such value in a text it redacts while the step runs, as written and as it appears inside a JSON string escaped once or twice, and shall do so for a value of any length, 1 to 3 characters included, and shall refuse every read after the step ended. No error shall hold a value.

## Examples

- Given a broker that holds `acme-key` as `sk-acme-1`,
  when a step reads `acme-key` and then redacts `"sent sk-acme-1"`,
  then it gets `sk-acme-1`, and the text reads `"sent [redacted]"`.
- Given a broker that holds `acme-key` as a value with a quote and a newline,
  when a step reads it and redacts a JSON text that holds it, or that JSON text inside another JSON string,
  then the escaped value reads `[redacted]` in both.
- Given a broker that holds `pin-key` as `907`,
  when a step reads it and redacts `"pin 907"`,
  then the text reads `"pin [redacted]"`.
- Given a step that read `acme-key`,
  when the step ends and it reads `acme-key` again,
  then the read fails, nothing is asked, and redacting keeps a text unchanged.
- Given a broker that refuses `token_key` as `reserved_name`,
  when a step reads it,
  then it gets `null`.
- Given a broker that refuses with `untrusted`,
  when a step reads a secret,
  then the read fails as untrusted.
- Given the name `1bad`,
  when a step reads it,
  then it fails with a `RangeError` and nothing is asked.
- Given a broker that answers `origins_get` with `[]`,
  when a step reads the key's origins,
  then the read fails.

## What it doesn't cover

Other encodings of a value (`\u` escapes of characters JSON leaves as they are, URL or base64 encoding), connector tokens (`token_get`) and wiring the adapter into the engine's step runner, which come with the engine role's assembly (HAL-14206).
