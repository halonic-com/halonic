# @halonicjs/adapter-git

Owner: tomas · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The Vcs port on the real git program, always hardened: no hooks, no user or system config, no program the repository names.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                               | What it does                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                         | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/adapter-git` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
