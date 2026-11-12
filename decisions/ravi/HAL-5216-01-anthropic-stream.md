# Decision: the Anthropic stream reader takes blocks only in order, and the bridge doesn't follow redirects

- Approval: the review follow-ups on HAL-5216 asked for both; the package owners decide them there, and Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:STOoO6vLDJ8k6Gs9LjMK+NKi2F4KAQHD3TViy8MUCDKvFVLnLNoDx8TFcfT3aa3hFzk++uvq0/meoXMBIbJDDQ==
- Task: HAL-5216

## What changes

`model-anthropic.stream-errors` gains one case and one example: the stream ends with `refused`
when a block starts at any index other than the next one in order (0, 1, 2 and on).

`harness-bridge.pass-through` gains one promise and one example: the bridge doesn't follow a
redirect from the provider's address, and answers 503 with the kind `unavailable` instead.

Every other promise and example stays as it was. No test was removed or weakened.

## Why

The API starts content blocks in order, so a reply that doesn't is malformed, and the reader
already refuses other malformed replies the same way. The model adapters already call the
provider with `redirect: "error"`; the bridge now does the same, so the key header only ever goes
to the route's fixed provider address. Both tighten existing behaviour, so the note is internal.

## Covers

- model-anthropic.stream-errors
- harness-bridge.pass-through
