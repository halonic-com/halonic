# @halonicjs/app-agent-host

Owner: owen · Layer: apps · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Halonic's agent host as one Node program (placeholder until the real host lands)

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                  | What it does                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                            | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/app-agent-host` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
