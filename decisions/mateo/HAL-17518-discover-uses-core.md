# Decision: `tooling-discover` may use core packages

- Task: HAL-17518
- Approval: Liam approved the plan on HAL-20151 (PR 3-2: `pnpm discover` writes the shell's route list); this changes the guard's own paths, so Liam and Julian sign as the two guardians
- Kind: user-visible

## What changes

`tooling/check/policy.json` adds `@halonicjs/tooling-discover` to `toolingUsesCore`, next to
`@halonicjs/tooling-paperclip`. Nothing else changes: no rule, requirement or test.

## Why

`pnpm discover` is about to write the desktop shell's action route list
(`apps/studio/src-tauri/src/generated/action-routes.json`) from the shipped catalog (#6707), so
it imports `@halonicjs/action-catalog`, `@halonicjs/action-steppers` and `@halonicjs/ports`. The
policy rules run the base commit's copy of `policy.json`, so the allowance must reach `main`
before #6707 can pass.

## Tests

No test was weakened or skipped. `pnpm check` passes with the entry.

## Covers

- tooling/check/
