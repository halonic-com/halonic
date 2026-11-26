# Decision: Turbo's codegen task follows the catalog and caches the shell's route list

- Task: HAL-17518
- Approval: Liam approved the plan on HAL-20151 (PR 3-2) and the code of #6707 on head `4a1d53aff`; it changes the guard's own path `turbo.json`, so Liam and Julian sign as the two guardians
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:0ZTSggyOTLJ76sEn3UcUXCvyG5/6a0fcua0tFkqA6bvSytFgej7hc6X7CNF7r81Js/iwkCwPfLGHfgE6o3L2BA==

## What changes

`pnpm discover` now writes `apps/studio/src-tauri/src/generated/action-routes.json` (git-ignored)
from the shipped catalog. In `turbo.json`, the `//#codegen` task gains the inputs
`packages/core/action-catalog/src/**/*.ts` and `packages/core/action-steppers/src/**/*.ts`
(tests excluded) and the output `apps/studio/src-tauri/src/generated/action-routes.json`.
No task, dependency or other input changes.

## Why

Without the inputs, a cached codegen run would skip discover after a catalog change and leave a
stale route list; without the output, a cache hit wouldn't restore the list, and the shell would
build with the empty fallback.

## Tests

No test was weakened or skipped. `tooling/discover/src/action-routes.test.ts` is new
(requirement `discover.action-routes`).

## Covers

- turbo.json
