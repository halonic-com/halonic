# Decision: the trusted runner start's test setup moves to a shared helper, so its two setup checks become throws

- Task: HAL-19197
- Approval: Liam approved halonic-com/halonic#6418 on HAL-19197 (https://paperclip.halonic.com/HAL/issues/HAL-19197). A team decision with no board card (HAL-2282 rule), Liam signs this note as the CTO.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:zYKnmlNer8epkDBa8AFwwsoP5ZZU2UDlU3yT9JvEw79/EUvGMEbq6FTT4UA6TYaxKlCbugNPwp2Ng81JRkWDBA==

## What changes

The setup of `trusted-runner-start.test.ts` (the radar integration, its trust, the start gate over fake sandboxes) moves to `trusted-runner.test-helper.ts`, because the new `connector-pause.test.ts` needs the same setup.

Its `trusted()` step used to check with two `expect` calls that the trust was saved and that the check after it says `trusted`. A helper outside a `*.test.ts` file may not import `vitest` (the core packages' import rule in `tooling/config/biome.jsonc`), so those two checks now throw an error instead. Nine tests of `app.trusted-runner-start` call `trusted()`, so the requirement makes 18 fewer expect calls: 32 instead of 50.

Nothing was weakened or skipped: every test still runs, and a trust that isn't saved or a check that isn't `trusted` still fails the test, now with an error that names it.

## Why

One setup for both test files keeps the trust and the pause tests on the same workspace, instead of two copies that can drift apart.

## Covers

- packages/core/app/src/trusted-runner-start.test.ts
- app.trusted-runner-start
