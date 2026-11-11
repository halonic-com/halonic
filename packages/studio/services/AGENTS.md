# @halonicjs/studio-services

Owner: priya · Layer: studio · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The Studio's platform bridges: services that come from the shell the Studio runs in, such as the keychain in the desktop app.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm verify` | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/studio-services` | runs only this package's tests (and the codegen they need) |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
