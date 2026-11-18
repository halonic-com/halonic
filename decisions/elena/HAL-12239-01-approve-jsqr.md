# Decision: allow jsqr in the kit's tests

- Task: HAL-12239
- Approval: Liam approved it in decision 15 of the phase B build plan on HAL-12232 (https://paperclip.halonic.com/HAL/issues/HAL-12232#document-plan): "Tests check it against upstream's sample matrices and decode its output with `jsqr`, a dev-only dependency (category `dev-tooling`, which I approve)."
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:RGgHLR/SvD7NV2BW4fY5DIpb5Rap1AkFssN746RvpiQ1E+kBZjEtUtlR6td9mO/Ra2ZnVfJJwhgrF4pZ/wKTBQ==

## What changes

`tooling/check/dependencies.json` gains `jsqr` (1.4.0, Apache-2.0, no dependencies) as `dev-tooling`, allowed only in `@halonicjs/studio-kit`. No rule of the check changes and no test is changed.

## Why

CI runs the dependency rule with the base commit's list, so the entry lands first, on its own. The pull request that vendors the QR encoder (halonic#3523) then adds `jsqr` to the catalog and to the kit's dev dependencies. `jsqr` only decodes the encoder's output in tests, as an independent check that phones can read it; it never ships.

## Covers

- tooling/check/
