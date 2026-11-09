# @halonicjs/testing-scenario

Owner: julian · Layer: testing · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Helpers for scenario-style tests: eventually() waits on a fake or real clock, and keepOnFailure() saves state when a test fails.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                    | What it does                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                              | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/testing-scenario` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
