# @halonicjs/app

Owner: liam · Layer: core · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The headless app kernel: command bus, event bus, service registry, workspace-wide undo and the routine scheduler service. No React.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                       | What it does                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                 | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/app` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
