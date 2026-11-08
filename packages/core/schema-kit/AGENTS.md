# @halonicjs/schema-kit

Owner: elena · Layer: core · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Our thin layer over Zod: validation, TypeScript types derived from the schemas and JSON Schema export. Errors carry the path. The only package besides core/format that imports zod.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                              | What it does                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                        | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/schema-kit` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
