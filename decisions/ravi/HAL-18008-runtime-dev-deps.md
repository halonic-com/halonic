# Decision: the Paperclip runtime may dev-depend on the plugin SDK and esbuild

- Task: HAL-18008
- Approval: Liam's decision W1 on HAL-18000 (condition 1: `@paperclipai/plugin-sdk` stays `dev-tooling` and appears only in tests); Liam signs this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:pYnu0dBZsdT1C61g1FkvgdzlDT9DkvoScd+bN9mwrpESfdZ68dJUOeLyeNAj0m81sDW8wOKuTQTO0LGvNwU6Cw==

## What changes

`tooling/check/dependencies.json` also allows two `dev-tooling` libraries in `@halonicjs/target-paperclip-runtime` (layer `targets`):

- `@paperclipai/plugin-sdk`: only in the runtime's contract tests, which run our own worker protocol client (HAL-18001, #5833) against the SDK's own test harness and protocol helpers.
- `esbuild`: builds the runtime's `worker.js`, the file the plugin builder copies into every plugin. Build and tests only.

Neither ships: both stay `dev-tooling`, which the `layers` rule keeps out of anything but tests and config files, and the worker's build refuses any `@paperclipai` code. The CI's `Policy rules` job reads this list from the base commit, so it lands before #5833 that uses it.

## Covers

- tooling/check/
