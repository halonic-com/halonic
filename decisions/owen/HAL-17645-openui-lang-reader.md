# Decision: a new core package for the OpenUI Lang reader

- Approval: Liam approved the new package on HAL-17645 (OpenUI A1: "a new core package made with `pnpm new package core/openui-lang`", Liam approves the new package there), from the OpenUI plan the board approved on HAL-17107. It changes `tooling/check/policy.json`, a trust root, so both guardians sign: Julian, then Liam
- Kind: internal

## What changes

A new core package, `@halonicjs/openui-lang`, reads the display part of OpenUI Lang 1.1 into a
checked component tree. `pnpm new package` added `@halonicjs/openui-lang` at the end of
`coreOrder` in `tooling/check/policy.json`. The package depends on no other core package, so its
place in the order doesn't matter yet. Nothing else in the guard changes.

## Tests

No test is weakened. The package's own tests run the spec's 58 conformance cases and the reader's
limits under the new requirement `openui-lang.reader`.

## Covers

- tooling/check/
