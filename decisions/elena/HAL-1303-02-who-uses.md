# Decision: the routine exports of `@halonicjs/app` move to a subpath

- Task: HAL-8986
- Approval: Liam approves this note in review on HAL-8986
- Kind: internal

## What changes

`tooling/check/policy.json` lists `./routines` as an allowed extra export of `@halonicjs/app`,
next to `./listed-tools`. Nothing else in the guard changes.

## Why

`packages/core/app/src/index.ts` reached the 500-line file-size limit with the `whoUses` export
(HAL-1303). `export *` is banned, so the routine exports (clocks, ids, list, scheduler, skips,
versions) move to `@halonicjs/app/routines` and the six importers in `apps` and `packages/core/engine`
use that path. The names are unchanged.

## Tests

No test was weakened or skipped.

## Covers

- tooling/check/policy.json
