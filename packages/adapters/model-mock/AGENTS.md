# @halonicjs/adapter-model-mock

Owner: liam · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The scripted mock model: replies and tool calls from a test's script, never the network. Used by `halonic test`, `type: mock` providers, the engine's tests and the parity run.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                      | What it does                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                                | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/adapter-model-mock` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
