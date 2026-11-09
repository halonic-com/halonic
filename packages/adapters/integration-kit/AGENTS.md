# @halonicjs/adapter-integration-kit

Owner: liam · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The integration interface: the IntegrationHost an integration gets, with an HttpClient limited to the hosts and secrets of its permission sheet. Web types only.

This package may change only through tasks that name it. Its public API is the `exports` map in `package.json`:
`src/index.ts` (the host side) and `src/integration/index.ts` (the integration entry, published as
`@halonicjs/integration-kit`); everything else is internal.

## Commands

| Command                                                           | What it does                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                                     | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/adapter-integration-kit` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- The integration entry (`src/integration/`) imports no outside code and nothing of the host side: it ends up in
  every integration's cloud bundle. The host side takes the error classes from
  `src/integration/index.ts` only, never from the files behind it, so there is one copy of each.
