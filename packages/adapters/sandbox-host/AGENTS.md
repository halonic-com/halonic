# @halonicjs/adapter-sandbox-host

Owner: mateo · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The launcher: finds programs on this machine and asks them short questions (the ProgramProbe port) with Node, as the sandbox will start them.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                        | What it does                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                                  | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/adapter-sandbox-host` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
