# Decision: the app kernel gets a `./failed-call` entry point for the failed-call words

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15150 (Liam approved moving the failed-call words and the choice of line into `@halonicjs/app`, so the CLI and Studio share them); Liam approves this note in his review on HAL-15149
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:KqPThUtDTRQm4LJl6A817evZdfVvN1PthS+Y9OQvpYEdpcw8xiUEB11q4nkoYWS4/KpdGdVtLD7cFg0vqxmABg==
- Task: HAL-15149

## What changes

`tooling/check/policy.json` lists `./failed-call` under `extraExports` for `@halonicjs/app`, and the
package's `exports` gain `"./failed-call": "./src/failed-call.ts"`. The new entry point holds the
failed-call templates, the pure `failedCallLine(result)` that picks a template and its values, and
`failedToolCalls`, which reads a step's failed calls from the run log (`app.failed-call-line`).
Nothing existing is removed or weakened.

## Why

Studio's run page and `halonic runs show` must say the same words for a failed tool call. Keeping
them in one place in core, without React, lets both fill the same template, and a separate entry
point keeps that code out of the kernel's main entry, as `./run-failure` already does.

## Covers

- tooling/check/policy.json
