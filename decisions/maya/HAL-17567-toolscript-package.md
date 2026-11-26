# Decision: a new core package for ToolScript

- Approval: Liam approved the plan for `packages/core/toolscript` on HAL-17567, from the ToolScript ADR on HAL-17560. It changes `tooling/check/policy.json`, a trust root, so both guardians sign: Julian, then Liam
- Kind: user-visible

## What changes

A new core package, `@halonicjs/toolscript`, made with `pnpm new package core/toolscript`. It is
listed in `coreOrder` in `tooling/check/policy.json` right after `@halonicjs/action-steppers`, which
its header schema will use. In this step it depends on no core package and holds only the format
name. CI runs the policy rules from the base commit's copy, so the header schema, the context types
and the artifact format follow in a second pull request once this one has merged. Nothing else in
the guard changes.

## Tests

No test is weakened. The package's first test checks the format name.

## Covers

- tooling/check/
