# @halonicjs/adapter-model-anthropic

Owner: tomas · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The Anthropic model adapter: chat calls over the Messages API (`/v1/messages`) on the built-in `fetch`, with no SDK. This first part writes requests and reads replies; the provider, streaming and the factory come in the next pull requests of HAL-2921.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                           | What it does                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                                     | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/adapter-model-anthropic` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
