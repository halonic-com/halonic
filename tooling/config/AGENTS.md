# @halonicjs/tooling-config

Owner: mateo · Layer: tooling · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Shared TypeScript presets, Biome config and Vitest preset.

This package may change only through tasks that name it. Its public API is the `exports` map in `package.json`
(the Vitest preset, the TypeScript presets and the Biome config); everything else is internal.

## Commands

| Command                                                  | What it does                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                            | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/tooling-config` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
