# @halonicjs/tooling-metrics

Owner: julian · Layer: tooling · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Read-only scripts that collect the team's quality and flow numbers, such as review findings per pull request.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                   | What it does                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                             | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/tooling-metrics` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
