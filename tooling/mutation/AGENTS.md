# @halonicjs/tooling-mutation

Owner: mateo · Layer: tooling · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The nightly Stryker run: scores each core package that has code and reports the score. A package with a floor fails the run when it scores under it; the rest only report.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                    | What it does                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                              | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/tooling-mutation` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
