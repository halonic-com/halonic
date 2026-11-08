# @halonicjs/tooling-discover

Owner: mateo · Layer: tooling · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Generates the registration files and keeps the Studio's feature list correct. Also scaffolds new packages and features.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                    | What it does                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                              | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/tooling-discover` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
