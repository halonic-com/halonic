# Decision: a new core package for the ToolScript host

- Approval: Liam approved the T5 plan on HAL-17570, including the new core package `packages/core/toolscript-host`. It changes `tooling/check/policy.json`, a trust root, so both guardians sign: Julian, then Liam
- Kind: user-visible

## What changes

A new core package, `@halonicjs/toolscript-host`, made with `pnpm new package core/toolscript-host`.
The generator added it at the end of `coreOrder` in `tooling/check/policy.json`, after
`@halonicjs/ports` and `@halonicjs/std`, which the host will use. CI runs the policy rules from the
base commit's copy, so in this step the package depends on no core package and holds only the list
of ADR rules it is for. The host itself (#6782) and its QuickJS wiring (#6802) follow once this one
has merged. Nothing else in the guard changes.

## Tests

No test is weakened. The package's first test checks the rule list.

## Covers

- tooling/check/
