# @halonicjs/adapter-harness-bridge

Owner: owen · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The Halonic bridge for harness runs: a loopback server per run that passes model requests to the provider and serves Halonic's tools over MCP.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                          | What it does                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                                    | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/adapter-harness-bridge` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
