# @halonicjs/adapter-integration-kit

Owner: liam · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The integration interface: the IntegrationHost an integration gets, with an HttpClient limited to the hosts and secrets of its permission sheet. Web types only.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                           | What it does                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                                     | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/adapter-integration-kit` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
