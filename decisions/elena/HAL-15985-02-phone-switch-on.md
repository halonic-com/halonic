# Decision: the Studio services package gets a `./tauri-channel` entry point for the phone's page

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15985 (Liam approved the plan, which keeps the phone app's page free of the Studio shell); the reviewer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BxxDQ0vMbKCW5lFHoySNX0NPoD5UaQ4Sm89UJlNKMU3K9oiZCFZA2JHv2V++wiGqp2ZB0F3/iJxgJeRFh6njBQ==
- Task: HAL-15985

## What changes

`tooling/check/policy.json` lists `./tauri-channel` under `extraExports` for `@halonicjs/studio-services`,
and the package's `exports` gain `"./tauri-channel": "./src/tauri-channel.ts"`. The Android page's
tunnel code imports `TauriChannel` from there and its IPC types from `./tauri-ipc`, instead of the
package root. Nothing existing is removed or weakened.

## Why

The package root also exports the Studio shell's services and the agent-host adapter. Imported from
the root, they end up in the connect page's build, and the connect page's bundle guard (#4546)
refuses that. The narrow entry point keeps the phone app's chunk to the phone's own code.

## Covers

- tooling/check/policy.json
