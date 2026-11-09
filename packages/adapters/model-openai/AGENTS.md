# @halonicjs/adapter-model-openai

Owner: tomas · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The OpenAI-compatible model adapter: chat calls over `/v1/chat/completions` for openai, openai-compatible, ollama and lmstudio providers. Streaming and the factories come in the next pull requests of HAL-2284.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                        | What it does                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                                  | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/adapter-model-openai` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
