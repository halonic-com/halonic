# Decision: a new core package for user-only action steppers

- Approval: the board decided to build user-only action steppers now (HAL-10, 24 Nov, stream HAL-17488); the package `packages/core/action-steppers`, placed right after `ports` in `coreOrder`, is set by the task HAL-17517 after Liam's review. It changes `tooling/check/policy.json`, a trust root, so both guardians sign: Julian, then Liam
- Kind: user-visible

## What changes

A new core package, `@halonicjs/action-steppers`, will hold the stepper request format, its
validator, strict parameters and the requester policy. CI runs the policy rules from the base
commit's copy, so a new core package lands in two steps (`docs/guides/checks.md`): this pull
request adds the package with its `coreOrder` entry and its first piece, `decideRequester`, with
its tests. The request format and validator follow in #5671.

`tooling/check/policy.json` adds `@halonicjs/action-steppers` to `coreOrder` right after
`@halonicjs/ports`. Nothing else in the guard changes.

## Tests

No test is weakened. The package's own tests pin the requester policy.

## Covers

- tooling/check/
