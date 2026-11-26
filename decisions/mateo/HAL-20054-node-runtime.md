# Decision: check the bundled Node in the Release workflow, and let the repo's Node pin run ahead of the CLI's floor

- Approval: HAL-20054; Liam reviews and signs
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JOnvRg5MurVruoWMyL5O8CY/h0E5lsVa/W9y7pgOcfdNsCFsxGEIkX0b6PErBNYi0nUo+G+9DRw2pqsHUt67Cg==

## What changes

The repo's Node pin, `devEngines.runtime` in the root `package.json`, moves from `^26.12.0` to `^26.13.1`, so `pnpm-lock.yaml` resolves `node@runtime` to 26.13.1, a security release. The agent hosts are built by that Node, so they bundle it.

`.github/workflows/release.yml` gets two steps:

- The build job runs `tooling/publish/src/cli/check-node-runtime.ts` before anything is built. It fails the release when Node's release list has a `security: true` release in the pinned major line that is newer than the lockfile's pin. When the list can't be read, it warns and passes, so a Node outage doesn't stop a release. Requirement: `publish.node-runtime`.
- The WSL runtime job, right after `build:sea`, fails when the Node that built the agent host is not the lockfile's pin, and prints the version the host runs.

Neither step adds a secret, a permission or an outside action.

## Test change

`apps/cli/src/node-floor.test.ts` asserted that `devEngines.runtime` is exactly `^<floor major>.<floor minor>.0`. The CLI's floor for users stays 26.12, but the repo now pins 26.13.1, so that equality can't hold. The test now asserts that `devEngines.runtime` is in the floor's major line, at or above the floor's minor, and that the CLI accepts it. It still catches a pin below the floor or in another major line; it no longer catches a floor that lags the repo's pin, which is now allowed on purpose.

## Covers

- .github/
- apps/cli/src/node-floor.test.ts
