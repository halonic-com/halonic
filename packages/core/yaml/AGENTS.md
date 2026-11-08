# @halonicjs/yaml

Owner: maya · Layer: core · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Our thin layer over the yaml library: reads and writes the YAML our workspace files use, with a line and column for every node and clear errors for what we don't support. The only package that imports yaml.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                        | What it does                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                  | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/yaml` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
