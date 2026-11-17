# server.secrets-write

- Status: active
- Since: unreleased
- Source: HAL-1292 (T4, PR 4a); models flow 3.3 (the API key's rules)

The server shall keep a provider key on `PUT /api/secrets/<name>`, behind the sign-in, with a JSON body `{"value": "<text>"}`, and answer `{"saved": true}`. The value shall be stored exactly as sent, without trimming. It replaces any key stored under the same name. A body that is not a JSON object with a string `value` that has a non-space character and at most 64 Ki UTF-16 units shall be refused with 400 `secret_not_accepted`; unknown fields shall be ignored. A value of that size fits in the body limit even when every unit is written as a `\u` escape, so a too-long value gets 400, not 413. There is no confirm flag: the connection check of `server.secrets-refusals` has no way round.

Rationale: a provider key is a long-lived, billable credential, so it goes one way, over a checked channel.

## Examples

- Given a same-origin JSON `PUT` with `{"value": "  sk-fake  "}`, then the store holds `  sk-fake  ` and the answer is `{"saved": true}`.
- Given `{"value": "   "}`, then the answer is 400 `secret_not_accepted` and nothing is stored.
- Given a value of 65,537 characters, then the answer is 400 `secret_not_accepted`.
